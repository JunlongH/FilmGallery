import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { api } from '../services/api';
import { 
  discoverPort, 
  discoverServices, 
  cleanIpAddress,
  DISCOVERY_MODE,
  type DiscoveryResult
} from '../utils/portDiscovery';

const SettingsScreen: React.FC = () => {
  const [serverURL, setServerURL] = useState('');
  const [ipAddress, setIpAddress] = useState(''); // For auto-discovery
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [discoveryStatus, setDiscoveryStatus] = useState('');
  const [discoveredServices, setDiscoveredServices] = useState<DiscoveryResult[]>([]);
  const [discoveryMode, setDiscoveryMode] = useState<'auto' | 'mdns' | 'portscan'>('auto');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [authBusy, setAuthBusy] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const url = await api.loadServerURL();
      setServerURL(url);
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setLoading(false);
    }
  };

  // Auto-discover using mDNS + port scan
  const handleAutoDiscover = async () => {
    setDiscovering(true);
    setDiscoveredServices([]);
    setDiscoveryStatus('正在扫描...');
    
    try {
      const result = await discoverServices({
        mode: discoveryMode,
        ip: cleanIpAddress(ipAddress) || undefined,
        timeout: 5000,
        onProgress: (progress) => {
          if (progress.step === 'mdns') {
            setDiscoveryStatus(progress.status === 'scanning' ? 'mDNS 发现中...' : 'mDNS 完成');
          } else if (progress.step === 'portscan') {
            setDiscoveryStatus(progress.status === 'scanning' ? '端口扫描中...' : '扫描完成');
          }
        }
      });
      
      if (result.services.length > 0) {
        setDiscoveredServices(result.services);
        setDiscoveryStatus(`发现 ${result.services.length} 个服务`);
        
        if (result.primaryService) {
          setServerURL(result.primaryService.fullUrl);
        }
        
        Alert.alert(
          '发现服务',
          `已找到 ${result.services.length} 个服务`
        );
      } else {
        setDiscoveryStatus('未找到服务');
        Alert.alert(
          '未找到服务',
          '请检查:\n1. FilmGallery 是否已启动\n2. 设备是否在同一网络\n3. 防火墙设置'
        );
      }
    } catch (e: any) {
      setDiscoveryStatus('发现失败');
      Alert.alert('错误', e.message || '发现过程出错');
    } finally {
      setDiscovering(false);
    }
  };

  const selectService = (service: DiscoveryResult) => {
    setServerURL(service.fullUrl);
  };

  const handleSave = async () => {
    if (!serverURL.trim()) {
      Alert.alert('Error', 'Server URL cannot be empty');
      return;
    }

    // Basic URL validation
    if (!serverURL.startsWith('http://') && !serverURL.startsWith('https://')) {
      Alert.alert('Error', 'Server URL must start with http:// or https://');
      return;
    }

    try {
      setSaving(true);
      await api.saveServerURL(serverURL.trim());
      Alert.alert('Success', 'Server URL saved successfully');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleLogin = async () => {
    if (!username.trim() || password.length < 12) {
      Alert.alert('Error', 'Enter a username and a password of at least 12 characters');
      return;
    }
    try {
      setAuthBusy(true);
      await api.login(username.trim(), password);
      setPassword('');
      Alert.alert('Success', 'Signed in successfully');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Sign in failed');
    } finally {
      setAuthBusy(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4CAF50" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.header}>Settings</Text>
      
      {/* Auto Discovery Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🔍 自动发现</Text>
        <Text style={styles.hint}>
          自动发现局域网内的 FilmGallery 服务
        </Text>
        
        {/* Discovery Mode Buttons */}
        <View style={styles.modeRow}>
          {(['auto', 'mdns', 'portscan'] as const).map((mode) => (
            <TouchableOpacity
              key={mode}
              style={[
                styles.modeButton,
                discoveryMode === mode && styles.modeButtonActive
              ]}
              onPress={() => setDiscoveryMode(mode)}
            >
              <Text style={[
                styles.modeButtonText,
                discoveryMode === mode && styles.modeButtonTextActive
              ]}>
                {mode === 'auto' ? '自动' : mode === 'mdns' ? 'mDNS' : '端口扫描'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        
        {/* IP Input for portscan mode */}
        {(discoveryMode === 'auto' || discoveryMode === 'portscan') && (
          <TextInput
            style={[styles.input, { marginBottom: 8 }]}
            value={ipAddress}
            onChangeText={setIpAddress}
            placeholder="IP 地址 (可选)"
            placeholderTextColor="#666"
            keyboardType="numeric"
            autoCapitalize="none"
          />
        )}
        
        {/* Discover Button */}
        <TouchableOpacity
          style={[styles.discoverButton, discovering && styles.saveButtonDisabled]}
          onPress={handleAutoDiscover}
          disabled={discovering}
        >
          {discovering ? (
            <View style={styles.discoverButtonContent}>
              <ActivityIndicator color="#fff" size="small" />
              <Text style={styles.discoverButtonText}>{discoveryStatus}</Text>
            </View>
          ) : (
            <Text style={styles.discoverButtonText}>开始发现</Text>
          )}
        </TouchableOpacity>
        
        {/* Discovered Services */}
        {discoveredServices.length > 0 && (
          <View style={styles.servicesContainer}>
            <Text style={styles.label}>发现的服务:</Text>
            {discoveredServices.map((service, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.serviceItem,
                  serverURL === service.fullUrl && styles.serviceItemActive
                ]}
                onPress={() => selectService(service)}
              >
                <Text style={styles.serviceIcon}>
                  {service.method === 'mdns' ? '📡' : '🔍'}
                </Text>
                <View style={styles.serviceInfo}>
                  <Text style={styles.serviceDevice}>{service.device || service.ip}</Text>
                  <Text style={styles.serviceUrl}>{service.fullUrl}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
      
      {/* Manual Configuration Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>手动配置</Text>
        <Text style={styles.label}>Server URL</Text>
        <TextInput
          style={styles.input}
          value={serverURL}
          onChangeText={setServerURL}
          placeholder="http://xxx.xxx.xx.xxx:4000"
          placeholderTextColor="#666"
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Text style={styles.hint}>
          完整服务器地址（自动发现后会自动填入）
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>账户登录</Text>
        <Text style={styles.label}>用户名</Text>
        <TextInput style={styles.input} value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} />
        <Text style={styles.label}>密码</Text>
        <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} />
        <TouchableOpacity style={[styles.saveButton, authBusy && styles.saveButtonDisabled]} onPress={handleLogin} disabled={authBusy}>
          {authBusy ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>登录</Text>}
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[styles.saveButton, saving && styles.saveButtonDisabled]}
        onPress={handleSave}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.saveButtonText}>Save</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  content: {
    padding: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  header: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 24,
    textAlign: 'center',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  label: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    padding: 12,
    color: '#fff',
    fontSize: 14,
  },
  ipInput: {
    flex: 1,
    marginRight: 8,
  },
  discoverRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  discoverButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 60,
  },
  discoverButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  hint: {
    color: '#666',
    fontSize: 12,
    marginTop: 6,
  },
  modeRow: {
    flexDirection: 'row',
    marginBottom: 12,
    gap: 8,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
  },
  modeButtonActive: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  modeButtonText: {
    color: '#888',
    fontSize: 12,
  },
  modeButtonTextActive: {
    color: '#fff',
    fontWeight: 'bold',
  },
  discoverButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  servicesContainer: {
    marginTop: 12,
  },
  serviceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#333',
  },
  serviceItemActive: {
    borderColor: '#4CAF50',
    backgroundColor: '#1a2a1a',
  },
  serviceIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  serviceInfo: {
    flex: 1,
  },
  serviceDevice: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  serviceUrl: {
    color: '#888',
    fontSize: 12,
    marginTop: 2,
  },
  saveButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 24,
    padding: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  saveButtonDisabled: {
    backgroundColor: '#666',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default SettingsScreen;
