/**
 * @filmgallery/libraw-native TypeScript Definitions
 */

declare module '@filmgallery/libraw-native' {
    /**
     * Color space constants for output
     */
    export const ColorSpace: {
        RAW: 0;
        SRGB: 1;
        ADOBE: 2;
        WIDE: 3;
        PROPHOTO: 4;
        XYZ: 5;
        ACES: 6;
        DCIP3: 7;
        REC2020: 8;
    };

    /**
     * Demosaic quality constants
     */
    export const DemosaicQuality: {
        LINEAR: 0;
        VNG: 1;
        PPG: 2;
        AHD: 3;
        DCB: 4;
        DHT: 11;
        AAHD: 12;
    };

    /**
     * Highlight recovery mode constants
     */
    export const HighlightMode: {
        CLIP: 0;
        UNCLIP: 1;
        BLEND: 2;
        REBUILD_3: 3;
        REBUILD_5: 5;
        REBUILD_7: 7;
        REBUILD_9: 9;
    };

    /**
     * Result from loading a file
     */
    export interface LoadResult {
        success: boolean;
        width: number;
        height: number;
        rawWidth?: number;
        rawHeight?: number;
    }

    /**
     * Result from processing
     */
    export interface ProcessResult {
        success: boolean;
        width: number;
        height: number;
        iwidth: number;
        iheight: number;
    }

    /**
     * Result from creating memory image
     */
    export interface MemImageResult {
        success: boolean;
        data: Buffer;
        dataSize: number;
        width: number;
        height: number;
        colors: number;
        bits: number;
        type: number;
    }

    /**
     * Result from unpacking thumbnail
     */
    export interface ThumbnailInfo {
        success: boolean;
        width: number;
        height: number;
        format: number;
    }

    /**
     * Camera/Image metadata
     */
    export interface Metadata {
        make: string;
        model: string;
        normalizedMake: string;
        normalizedModel: string;
        software: string;
        rawCount: number;
        dngVersion: number;
        isFoveon: boolean;
        colors: number;
        cdesc: string;
        xmpLen: number;
        iso: number;
        shutter: number;
        aperture: number;
        focalLength: number;
        timestamp: number;
        shotOrder: number;
        artist: string;
        desc: string;
        gpsData: string;
    }

    /**
     * Image size information
     */
    export interface ImageSize {
        rawWidth: number;
        rawHeight: number;
        width: number;
        height: number;
        iwidth: number;
        iheight: number;
        topMargin: number;
        leftMargin: number;
        flip: number;
        pixelAspect: number;
    }

    /**
     * Lens information
     */
    export interface LensInfo {
        minFocal: number;
        maxFocal: number;
        maxApAtMinFocal: number;
        maxApAtMaxFocal: number;
        exifMaxAp: number;
        lensMake: string;
        lens: string;
        lensSerial: string;
        internalLensSerial: string;
        focalLengthIn35mm: number;
    }

    /**
     * Color/White balance information
     */
    export interface ColorInfo {
        cameraMultipliers: [number, number, number, number];
        preMultipliers: [number, number, number, number];
        black: number;
        maximum: number;
        fmaximum: number;
        fnorm: number;
    }

    /**
     * Version information
     */
    export interface VersionInfo {
        version: string;
        versionNumber: number;
    }

    /**
     * LibRaw Processor class for RAW image processing
     */
    export class LibRawProcessor {
        constructor();

        // Core methods (async with callback, use Promise wrapper)
        loadFile(path: string, callback: (err: Error | null, result: LoadResult) => void): void;
        loadBuffer(buffer: Buffer, callback: (err: Error | null, result: LoadResult) => void): void;
        unpack(callback: (err: Error | null, result: { success: boolean }) => void): void;
        unpackThumbnail(callback: (err: Error | null, result: ThumbnailInfo) => void): void;
        dcrawProcess(callback: (err: Error | null, result: ProcessResult) => void): void;
        makeMemImage(callback: (err: Error | null, result: MemImageResult) => void): void;
        makeMemThumbnail(callback: (err: Error | null, result: MemImageResult) => void): void;

        // Promisified versions (added by wrapper)
        loadFile(path: string): Promise<LoadResult>;
        loadBuffer(buffer: Buffer): Promise<LoadResult>;
        unpack(): Promise<{ success: boolean }>;
        unpackThumbnail(): Promise<ThumbnailInfo>;
        dcrawProcess(): Promise<ProcessResult>;
        processImage(): Promise<ProcessResult>;  // Alias for dcrawProcess
        makeMemImage(): Promise<MemImageResult>;
        makeMemThumbnail(): Promise<MemImageResult>;

        // Synchronous metadata methods
        getMetadata(): Metadata;
        getImageSize(): ImageSize;
        getLensInfo(): LensInfo;
        getColorInfo(): ColorInfo;

        // Configuration methods
        setOutputColorSpace(colorSpace: number): void;
        setOutputBps(bits: 8 | 16): void;
        setGamma(power: number, slope: number): void;
        setWhiteBalance(r: number, g1: number, b: number, g2: number): void;
        setHalfSize(halfSize: boolean): void;
        setNoAutoBright(noAutoBright: boolean): void;
        setUseCameraWB(useCameraWB: boolean): void;
        setUseAutoWB(useAutoWB: boolean): void;
        setQuality(quality: number): void;
        setHighlightMode(mode: number): void;

        // Utility methods
        recycle(): void;
        close(): void;
        isLoaded(): boolean;
    }

    /**
     * Get LibRaw version information
     */
    export function getVersion(): VersionInfo;

    /**
     * Get list of all supported cameras
     */
    export function getCameraList(): string[];

    /**
     * Get count of supported cameras
     */
    export function getCameraCount(): number;

    /**
     * Check if a specific camera model is supported
     */
    export function isSupportedCamera(model: string): boolean;

    /**
     * Check if the native module is available
     */
    export function isAvailable(): boolean;

    /**
     * Get the load error if module failed to load
     */
    export function getLoadError(): Error | null;
}

declare module '@filmgallery/libraw-native/processor' {
    import { Metadata, ImageSize, LensInfo, ColorInfo } from '@filmgallery/libraw-native';

    export interface DecodeOptions {
        colorSpace?: number;
        outputBps?: 8 | 16;
        quality?: number;
        useCameraWB?: boolean;
        useAutoWB?: boolean;
        noAutoBright?: boolean;
        halfSize?: boolean;
        highlightMode?: number;
    }

    export interface JPEGOptions extends DecodeOptions {
        quality?: number;  // 1-100
        progressive?: boolean;
    }

    export interface TIFFOptions extends DecodeOptions {
        compression?: 'none' | 'lzw' | 'deflate';
    }

    export interface DecodeResult {
        data: Buffer;
        width: number;
        height: number;
        bits: number;
        colors: number;
        metadata: Metadata & ImageSize;
    }

    export interface BufferResult {
        buffer: Buffer;
        success: boolean;
        metadata: {
            outputDimensions: {
                width: number;
                height: number;
            };
        } & Metadata & ImageSize;
    }

    export interface ThumbnailResult {
        data: Buffer;
        width: number;
        height: number;
        success: boolean;
    }

    export interface ExtendedMetadata extends Metadata {
        camera: string;
        width: number;
        height: number;
        rawWidth: number;
        rawHeight: number;
        flip: number;
        lens: string;
        lensInfo: LensInfo;
        colorInfo: ColorInfo;
    }

    /**
     * Decode a RAW file and return raw pixel data
     */
    export function decodeRaw(input: string | Buffer, options?: DecodeOptions): Promise<DecodeResult>;

    /**
     * Decode a RAW file to JPEG buffer
     */
    export function decodeToJPEG(input: string | Buffer, options?: JPEGOptions): Promise<BufferResult>;

    /**
     * Decode a RAW file to TIFF buffer
     */
    export function decodeToTIFF(input: string | Buffer, options?: TIFFOptions): Promise<BufferResult>;

    /**
     * Extract embedded thumbnail from RAW file
     */
    export function extractThumbnail(input: string | Buffer): Promise<ThumbnailResult | null>;

    /**
     * Get metadata from RAW file without full processing
     */
    export function getMetadata(input: string | Buffer): Promise<ExtendedMetadata>;

    /**
     * Default processing options
     */
    export const DEFAULT_OPTIONS: DecodeOptions;
}
