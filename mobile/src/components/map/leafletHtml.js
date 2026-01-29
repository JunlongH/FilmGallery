export const getLeafletHtml = (initialRegion) => `
<!DOCTYPE html>
<html>
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin=""/>
    <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.4.1/dist/MarkerCluster.css" />
    <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.4.1/dist/MarkerCluster.Default.css" />
    <style>
        body { margin: 0; padding: 0; }
        #map { width: 100vw; height: 100vh; background-color: #f0f0f0; }
        
        /* Custom Marker Styles */
        .custom-marker {
            border-radius: 8px;
            overflow: hidden;
            border: 2px solid white;
            box-shadow: 0 2px 5px rgba(0,0,0,0.3);
            background: #eee;
        }
        .custom-marker img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }

        /* Cluster Styles */
        .cluster-mosaic {
            width: 60px;
            height: 60px;
            background: rgba(255,255,255,0.9);
            border-radius: 12px;
            box-shadow: 0 4px 10px rgba(0,0,0,0.2);
            overflow: hidden;
            display: flex;
            flex-wrap: wrap;
            border: 3px solid white;
            position: relative;
        }
        .mosaic-item {
            width: 50%;
            height: 50%;
            box-sizing: border-box;
            border: 0.5px solid white;
        }
        .mosaic-item img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }
        .cluster-count {
            position: absolute;
            bottom: -5px;
            right: -5px;
            background: #ff3b30;
            color: white;
            border-radius: 10px;
            padding: 2px 6px;
            font-size: 10px;
            font-weight: bold;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
            z-index: 10;
        }
    </style>
</head>
<body>
    <div id="map"></div>
    
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
    <script src="https://unpkg.com/leaflet.markercluster@1.4.1/dist/leaflet.markercluster.js"></script>

    <script>
        // Initialize Map
        // Use provided initial region or default
        const startLat = ${initialRegion.latitude || 31.2304};
        const startLng = ${initialRegion.longitude || 121.4737};
        const startZoom = 5;

        const map = L.map('map', {
            zoomControl: false,
            attributionControl: false
        }).setView([startLat, startLng], startZoom);

        // Add Tile Layer (CartoDB Voyager - Clean & Nice)
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            maxZoom: 20,
            subdomains: 'abcd'
        }).addTo(map);

        // Marker Cluster Group
        let markers = L.markerClusterGroup({
            showCoverageOnHover: false,
            zoomToBoundsOnClick: true,
            maxClusterRadius: 60, // Pixel distance to cluster
            spiderfyOnMaxZoom: true,
            
            // Custom Icon Create Function for "Mosaic" effect
            iconCreateFunction: function (cluster) {
                const childMarkers = cluster.getAllChildMarkers();
                const count = childMarkers.length;
                let images = [];
                
                // Get up to 4 images from children
                for (let i = 0; i < Math.min(4, count); i++) {
                    const props = childMarkers[i].options.photoData;
                    if (props && props.thumbUrl) {
                        images.push(props.thumbUrl);
                    }
                }

                // If not enough images, repeat the last one or placeholder
                // (Usually we just render what we have)
                
                let html = '<div class="cluster-mosaic">';
                images.forEach(url => {
                    html += '<div class="mosaic-item"><img src="' + url + '" onerror="this.style.display=\\'none\\'"/></div>';
                });
                
                // If we have fewer than 4 icons, user css flex handles it reasonably, 
                // but let's just ensure we have divs to fill space if needed or just let it be.
                
                html += '<div class="cluster-count">' + count + '</div>';
                html += '</div>';

                return L.divIcon({
                    html: html,
                    className: '', // Clear default class
                    iconSize: [60, 60],
                    iconAnchor: [30, 30]
                });
            }
        });

        map.addLayer(markers);

        // Communicate with React Native
        function sendMessage(type, payload) {
            if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({ type, payload }));
            }
        }

        // Handle Messages from React Native
        document.addEventListener('message', handleMessage);
        window.addEventListener('message', handleMessage);

        function handleMessage(event) {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'UPDATE_PHOTOS') {
                    updateMarkers(data.payload);
                } else if (data.type === 'CENTER_MAP') {
                    const { lat, lng, zoom } = data.payload;
                    map.setView([lat, lng], zoom || 15, { animate: true });
                }
            } catch (e) {
                console.error('Error parsing message', e);
            }
        }

        // Update Markers Logic
        function updateMarkers(photos) {
            markers.clearLayers();
            
            const newMarkers = photos.map(photo => {
                const lat = parseFloat(photo.latitude);
                const lng = parseFloat(photo.longitude);
                if (isNaN(lat) || isNaN(lng)) return null;

                const iconHtml = \`
                    <div class="custom-marker" style="width: 50px; height: 50px;">
                        <img src="\${photo.thumbnailUrl}" style="width:100%;height:100%;object-fit:cover;" />
                    </div>
                \`;

                const icon = L.divIcon({
                    html: iconHtml,
                    className: '',
                    iconSize: [50, 50],
                    iconAnchor: [25, 25]
                });

                const marker = L.marker([lat, lng], { 
                    icon: icon,
                    photoData: { 
                        id: photo.id,
                        thumbUrl: photo.thumbnailUrl 
                    }
                });

                marker.on('click', () => {
                   sendMessage('MARKER_PRESS', photo);
                });

                return marker;
            }).filter(m => m !== null);

            markers.addLayers(newMarkers);
        }

        // Tell RN we are ready
        sendMessage('MAP_READY', null);

    </script>
</body>
</html>
`;
