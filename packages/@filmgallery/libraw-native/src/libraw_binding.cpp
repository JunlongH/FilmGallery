/**
 * @filmgallery/libraw-native - LibRaw N-API Bindings
 * 
 * Native Node.js bindings for LibRaw 0.22+
 * Provides async/sync methods for RAW image decoding
 * 
 * @author FilmGallery
 * @license MIT
 */

#include <napi.h>
#include "libraw/libraw.h"
#include "async_workers.h"
#include <string>
#include <cstring>
#include <memory>

// ============================================================================
// LibRawProcessor Class - Wraps libraw_data_t
// ============================================================================

class LibRawProcessor : public Napi::ObjectWrap<LibRawProcessor> {
public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports);
    LibRawProcessor(const Napi::CallbackInfo& info);
    ~LibRawProcessor();

private:
    // Core methods
    Napi::Value LoadFile(const Napi::CallbackInfo& info);
    Napi::Value LoadBuffer(const Napi::CallbackInfo& info);
    Napi::Value Unpack(const Napi::CallbackInfo& info);
    Napi::Value UnpackThumbnail(const Napi::CallbackInfo& info);
    Napi::Value DcrawProcess(const Napi::CallbackInfo& info);
    Napi::Value MakeMemImage(const Napi::CallbackInfo& info);
    Napi::Value MakeMemThumbnail(const Napi::CallbackInfo& info);
    
    // Metadata methods
    Napi::Value GetMetadata(const Napi::CallbackInfo& info);
    Napi::Value GetImageSize(const Napi::CallbackInfo& info);
    Napi::Value GetLensInfo(const Napi::CallbackInfo& info);
    Napi::Value GetColorInfo(const Napi::CallbackInfo& info);
    
    // Configuration methods
    Napi::Value SetOutputColorSpace(const Napi::CallbackInfo& info);
    Napi::Value SetOutputBps(const Napi::CallbackInfo& info);
    Napi::Value SetGamma(const Napi::CallbackInfo& info);
    Napi::Value SetWhiteBalance(const Napi::CallbackInfo& info);
    Napi::Value SetHalfSize(const Napi::CallbackInfo& info);
    Napi::Value SetNoAutoBright(const Napi::CallbackInfo& info);
    Napi::Value SetUseCameraWB(const Napi::CallbackInfo& info);
    Napi::Value SetUseAutoWB(const Napi::CallbackInfo& info);
    Napi::Value SetQuality(const Napi::CallbackInfo& info);
    Napi::Value SetHighlightMode(const Napi::CallbackInfo& info);
    
    // Utility methods
    Napi::Value Recycle(const Napi::CallbackInfo& info);
    Napi::Value Close(const Napi::CallbackInfo& info);
    Napi::Value IsLoaded(const Napi::CallbackInfo& info);
    
    // LibRaw instance
    std::unique_ptr<LibRaw> processor_;
    bool is_loaded_;
    bool is_unpacked_;
    bool is_processed_;
};

// ============================================================================
// Static initialization
// ============================================================================

Napi::Object LibRawProcessor::Init(Napi::Env env, Napi::Object exports) {
    Napi::Function func = DefineClass(env, "LibRawProcessor", {
        // Core methods
        InstanceMethod<&LibRawProcessor::LoadFile>("loadFile"),
        InstanceMethod<&LibRawProcessor::LoadBuffer>("loadBuffer"),
        InstanceMethod<&LibRawProcessor::Unpack>("unpack"),
        InstanceMethod<&LibRawProcessor::UnpackThumbnail>("unpackThumbnail"),
        InstanceMethod<&LibRawProcessor::DcrawProcess>("dcrawProcess"),
        InstanceMethod<&LibRawProcessor::MakeMemImage>("makeMemImage"),
        InstanceMethod<&LibRawProcessor::MakeMemThumbnail>("makeMemThumbnail"),
        
        // Metadata methods
        InstanceMethod<&LibRawProcessor::GetMetadata>("getMetadata"),
        InstanceMethod<&LibRawProcessor::GetImageSize>("getImageSize"),
        InstanceMethod<&LibRawProcessor::GetLensInfo>("getLensInfo"),
        InstanceMethod<&LibRawProcessor::GetColorInfo>("getColorInfo"),
        
        // Configuration methods
        InstanceMethod<&LibRawProcessor::SetOutputColorSpace>("setOutputColorSpace"),
        InstanceMethod<&LibRawProcessor::SetOutputBps>("setOutputBps"),
        InstanceMethod<&LibRawProcessor::SetGamma>("setGamma"),
        InstanceMethod<&LibRawProcessor::SetWhiteBalance>("setWhiteBalance"),
        InstanceMethod<&LibRawProcessor::SetHalfSize>("setHalfSize"),
        InstanceMethod<&LibRawProcessor::SetNoAutoBright>("setNoAutoBright"),
        InstanceMethod<&LibRawProcessor::SetUseCameraWB>("setUseCameraWB"),
        InstanceMethod<&LibRawProcessor::SetUseAutoWB>("setUseAutoWB"),
        InstanceMethod<&LibRawProcessor::SetQuality>("setQuality"),
        InstanceMethod<&LibRawProcessor::SetHighlightMode>("setHighlightMode"),
        
        // Utility methods
        InstanceMethod<&LibRawProcessor::Recycle>("recycle"),
        InstanceMethod<&LibRawProcessor::Close>("close"),
        InstanceMethod<&LibRawProcessor::IsLoaded>("isLoaded"),
    });

    Napi::FunctionReference* constructor = new Napi::FunctionReference();
    *constructor = Napi::Persistent(func);
    env.SetInstanceData(constructor);

    exports.Set("LibRawProcessor", func);
    return exports;
}

// ============================================================================
// Constructor / Destructor
// ============================================================================

LibRawProcessor::LibRawProcessor(const Napi::CallbackInfo& info)
    : Napi::ObjectWrap<LibRawProcessor>(info),
      processor_(std::make_unique<LibRaw>()),
      is_loaded_(false),
      is_unpacked_(false),
      is_processed_(false) {
    
    // Set default output parameters
    processor_->imgdata.params.output_bps = 16;  // 16-bit output
    processor_->imgdata.params.use_camera_wb = 1;  // Use camera white balance
    processor_->imgdata.params.output_color = 1;  // sRGB
    processor_->imgdata.params.no_auto_bright = 1;  // No auto brightness
    processor_->imgdata.params.gamm[0] = 1.0 / 2.4;  // sRGB gamma
    processor_->imgdata.params.gamm[1] = 12.92;
    processor_->imgdata.params.use_camera_matrix = 1;  // Use camera color matrix
    processor_->imgdata.params.half_size = 0;  // Full size output (no crop)
    processor_->imgdata.params.user_flip = 0;  // Auto rotation based on EXIF
}

LibRawProcessor::~LibRawProcessor() {
    if (processor_) {
        processor_->recycle();
    }
}

// ============================================================================
// Core Methods - Async File Loading
// ============================================================================

Napi::Value LibRawProcessor::LoadFile(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 2 || !info[0].IsString() || !info[1].IsFunction()) {
        Napi::TypeError::New(env, "Expected (string path, function callback)")
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }
    
    std::string path = info[0].As<Napi::String>().Utf8Value();
    Napi::Function callback = info[1].As<Napi::Function>();
    
    // Recycle before loading new file
    processor_->recycle();
    is_loaded_ = false;
    is_unpacked_ = false;
    is_processed_ = false;
    
    LoadFileWorker* worker = new LoadFileWorker(callback, processor_.get(), path);
    worker->Queue();
    
    // Mark as loaded after queuing (will be set properly in OnOK)
    is_loaded_ = true;
    
    return env.Undefined();
}

Napi::Value LibRawProcessor::LoadBuffer(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 2 || !info[0].IsBuffer() || !info[1].IsFunction()) {
        Napi::TypeError::New(env, "Expected (Buffer data, function callback)")
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }
    
    Napi::Buffer<char> buffer = info[0].As<Napi::Buffer<char>>();
    Napi::Function callback = info[1].As<Napi::Function>();
    
    // Recycle before loading new file
    processor_->recycle();
    is_loaded_ = false;
    is_unpacked_ = false;
    is_processed_ = false;
    
    LoadBufferWorker* worker = new LoadBufferWorker(
        callback, processor_.get(), buffer.Data(), buffer.Length()
    );
    worker->Queue();
    
    is_loaded_ = true;
    
    return env.Undefined();
}

// ============================================================================
// Core Methods - Async Processing
// ============================================================================

Napi::Value LibRawProcessor::Unpack(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 1 || !info[0].IsFunction()) {
        Napi::TypeError::New(env, "Expected (function callback)")
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }
    
    if (!is_loaded_) {
        Napi::Error::New(env, "No file loaded").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    
    Napi::Function callback = info[0].As<Napi::Function>();
    
    UnpackWorker* worker = new UnpackWorker(callback, processor_.get());
    worker->Queue();
    
    is_unpacked_ = true;
    
    return env.Undefined();
}

Napi::Value LibRawProcessor::DcrawProcess(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 1 || !info[0].IsFunction()) {
        Napi::TypeError::New(env, "Expected (function callback)")
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }
    
    if (!is_loaded_) {
        Napi::Error::New(env, "No file loaded").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    
    Napi::Function callback = info[0].As<Napi::Function>();
    
    ProcessWorker* worker = new ProcessWorker(callback, processor_.get());
    worker->Queue();
    
    is_processed_ = true;
    
    return env.Undefined();
}

Napi::Value LibRawProcessor::MakeMemImage(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 1 || !info[0].IsFunction()) {
        Napi::TypeError::New(env, "Expected (function callback)")
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }
    
    Napi::Function callback = info[0].As<Napi::Function>();
    
    MakeMemImageWorker* worker = new MakeMemImageWorker(callback, processor_.get());
    worker->Queue();
    
    return env.Undefined();
}

// ============================================================================
// Thumbnail Methods
// ============================================================================

Napi::Value LibRawProcessor::UnpackThumbnail(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 1 || !info[0].IsFunction()) {
        Napi::TypeError::New(env, "Expected (function callback)")
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }
    
    if (!is_loaded_) {
        Napi::Error::New(env, "No file loaded").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    
    Napi::Function callback = info[0].As<Napi::Function>();
    
    UnpackThumbnailWorker* worker = new UnpackThumbnailWorker(callback, processor_.get());
    worker->Queue();
    
    return env.Undefined();
}

Napi::Value LibRawProcessor::MakeMemThumbnail(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 1 || !info[0].IsFunction()) {
        Napi::TypeError::New(env, "Expected (function callback)")
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }
    
    Napi::Function callback = info[0].As<Napi::Function>();
    
    MakeMemThumbnailWorker* worker = new MakeMemThumbnailWorker(callback, processor_.get());
    worker->Queue();
    
    return env.Undefined();
}

// ============================================================================
// Metadata Methods (Synchronous)
// ============================================================================

Napi::Value LibRawProcessor::GetMetadata(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (!is_loaded_) {
        Napi::Error::New(env, "No file loaded").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    
    Napi::Object result = Napi::Object::New(env);
    
    // Camera info
    result.Set("make", Napi::String::New(env, processor_->imgdata.idata.make));
    result.Set("model", Napi::String::New(env, processor_->imgdata.idata.model));
    result.Set("normalizedMake", Napi::String::New(env, processor_->imgdata.idata.normalized_make));
    result.Set("normalizedModel", Napi::String::New(env, processor_->imgdata.idata.normalized_model));
    result.Set("software", Napi::String::New(env, processor_->imgdata.idata.software));
    
    // Image info
    result.Set("rawCount", Napi::Number::New(env, processor_->imgdata.idata.raw_count));
    result.Set("dngVersion", Napi::Number::New(env, processor_->imgdata.idata.dng_version));
    result.Set("isFoveon", Napi::Boolean::New(env, processor_->imgdata.idata.is_foveon != 0));
    result.Set("colors", Napi::Number::New(env, processor_->imgdata.idata.colors));
    result.Set("cdesc", Napi::String::New(env, processor_->imgdata.idata.cdesc));
    result.Set("xmpLen", Napi::Number::New(env, processor_->imgdata.idata.xmplen));
    
    // Other params
    result.Set("iso", Napi::Number::New(env, processor_->imgdata.other.iso_speed));
    result.Set("shutter", Napi::Number::New(env, processor_->imgdata.other.shutter));
    result.Set("aperture", Napi::Number::New(env, processor_->imgdata.other.aperture));
    result.Set("focalLength", Napi::Number::New(env, processor_->imgdata.other.focal_len));
    result.Set("timestamp", Napi::Number::New(env, static_cast<double>(processor_->imgdata.other.timestamp)));
    result.Set("shotOrder", Napi::Number::New(env, processor_->imgdata.other.shot_order));
    result.Set("artist", Napi::String::New(env, processor_->imgdata.other.artist));
    result.Set("desc", Napi::String::New(env, processor_->imgdata.other.desc));
    
    // GPS data is stored as unsigned int array, convert to readable format
    Napi::Array gpsArray = Napi::Array::New(env, 32);
    for (int i = 0; i < 32; i++) {
        gpsArray.Set(static_cast<uint32_t>(i), Napi::Number::New(env, processor_->imgdata.other.gpsdata[i]));
    }
    result.Set("gpsData", gpsArray);
    
    return result;
}

Napi::Value LibRawProcessor::GetImageSize(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (!is_loaded_) {
        Napi::Error::New(env, "No file loaded").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    
    Napi::Object result = Napi::Object::New(env);
    
    result.Set("rawWidth", Napi::Number::New(env, processor_->imgdata.sizes.raw_width));
    result.Set("rawHeight", Napi::Number::New(env, processor_->imgdata.sizes.raw_height));
    result.Set("width", Napi::Number::New(env, processor_->imgdata.sizes.width));
    result.Set("height", Napi::Number::New(env, processor_->imgdata.sizes.height));
    result.Set("iwidth", Napi::Number::New(env, processor_->imgdata.sizes.iwidth));
    result.Set("iheight", Napi::Number::New(env, processor_->imgdata.sizes.iheight));
    result.Set("topMargin", Napi::Number::New(env, processor_->imgdata.sizes.top_margin));
    result.Set("leftMargin", Napi::Number::New(env, processor_->imgdata.sizes.left_margin));
    result.Set("flip", Napi::Number::New(env, processor_->imgdata.sizes.flip));
    result.Set("pixelAspect", Napi::Number::New(env, processor_->imgdata.sizes.pixel_aspect));
    
    return result;
}

Napi::Value LibRawProcessor::GetLensInfo(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (!is_loaded_) {
        Napi::Error::New(env, "No file loaded").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    
    Napi::Object result = Napi::Object::New(env);
    
    result.Set("minFocal", Napi::Number::New(env, processor_->imgdata.lens.MinFocal));
    result.Set("maxFocal", Napi::Number::New(env, processor_->imgdata.lens.MaxFocal));
    result.Set("maxApAtMinFocal", Napi::Number::New(env, processor_->imgdata.lens.MaxAp4MinFocal));
    result.Set("maxApAtMaxFocal", Napi::Number::New(env, processor_->imgdata.lens.MaxAp4MaxFocal));
    result.Set("exifMaxAp", Napi::Number::New(env, processor_->imgdata.lens.EXIF_MaxAp));
    result.Set("lensMake", Napi::String::New(env, processor_->imgdata.lens.LensMake));
    result.Set("lens", Napi::String::New(env, processor_->imgdata.lens.Lens));
    result.Set("lensSerial", Napi::String::New(env, processor_->imgdata.lens.LensSerial));
    result.Set("internalLensSerial", Napi::String::New(env, processor_->imgdata.lens.InternalLensSerial));
    result.Set("focalLengthIn35mm", Napi::Number::New(env, processor_->imgdata.lens.FocalLengthIn35mmFormat));
    
    return result;
}

Napi::Value LibRawProcessor::GetColorInfo(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (!is_loaded_) {
        Napi::Error::New(env, "No file loaded").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    
    Napi::Object result = Napi::Object::New(env);
    
    // Camera multipliers (white balance)
    Napi::Array camMul = Napi::Array::New(env, 4);
    for (int i = 0; i < 4; i++) {
        camMul.Set(i, Napi::Number::New(env, processor_->imgdata.color.cam_mul[i]));
    }
    result.Set("cameraMultipliers", camMul);
    
    // Pre-multipliers
    Napi::Array preMul = Napi::Array::New(env, 4);
    for (int i = 0; i < 4; i++) {
        preMul.Set(i, Napi::Number::New(env, processor_->imgdata.color.pre_mul[i]));
    }
    result.Set("preMultipliers", preMul);
    
    // Black levels
    result.Set("black", Napi::Number::New(env, processor_->imgdata.color.black));
    result.Set("maximum", Napi::Number::New(env, processor_->imgdata.color.maximum));
    result.Set("fmaximum", Napi::Number::New(env, processor_->imgdata.color.fmaximum));
    result.Set("fnorm", Napi::Number::New(env, processor_->imgdata.color.fnorm));
    
    return result;
}

// ============================================================================
// Configuration Methods
// ============================================================================

Napi::Value LibRawProcessor::SetOutputColorSpace(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 1 || !info[0].IsNumber()) {
        Napi::TypeError::New(env, "Expected (number colorSpace)")
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }
    
    // 0=raw, 1=sRGB, 2=Adobe, 3=Wide, 4=ProPhoto, 5=XYZ, 6=ACES, 7=DCI-P3, 8=Rec2020
    processor_->imgdata.params.output_color = info[0].As<Napi::Number>().Int32Value();
    
    return env.Undefined();
}

Napi::Value LibRawProcessor::SetOutputBps(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 1 || !info[0].IsNumber()) {
        Napi::TypeError::New(env, "Expected (number bits)")
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }
    
    // 8 or 16
    processor_->imgdata.params.output_bps = info[0].As<Napi::Number>().Int32Value();
    
    return env.Undefined();
}

Napi::Value LibRawProcessor::SetGamma(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsNumber()) {
        Napi::TypeError::New(env, "Expected (number power, number slope)")
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }
    
    processor_->imgdata.params.gamm[0] = info[0].As<Napi::Number>().DoubleValue();
    processor_->imgdata.params.gamm[1] = info[1].As<Napi::Number>().DoubleValue();
    
    return env.Undefined();
}

Napi::Value LibRawProcessor::SetWhiteBalance(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 4) {
        Napi::TypeError::New(env, "Expected (r, g1, b, g2) multipliers")
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }
    
    processor_->imgdata.params.user_mul[0] = info[0].As<Napi::Number>().FloatValue();
    processor_->imgdata.params.user_mul[1] = info[1].As<Napi::Number>().FloatValue();
    processor_->imgdata.params.user_mul[2] = info[2].As<Napi::Number>().FloatValue();
    processor_->imgdata.params.user_mul[3] = info[3].As<Napi::Number>().FloatValue();
    
    // Disable auto/camera WB when using user multipliers
    processor_->imgdata.params.use_camera_wb = 0;
    processor_->imgdata.params.use_auto_wb = 0;
    
    return env.Undefined();
}

Napi::Value LibRawProcessor::SetHalfSize(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 1 || !info[0].IsBoolean()) {
        Napi::TypeError::New(env, "Expected (boolean halfSize)")
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }
    
    processor_->imgdata.params.half_size = info[0].As<Napi::Boolean>().Value() ? 1 : 0;
    
    return env.Undefined();
}

Napi::Value LibRawProcessor::SetNoAutoBright(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 1 || !info[0].IsBoolean()) {
        Napi::TypeError::New(env, "Expected (boolean noAutoBright)")
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }
    
    processor_->imgdata.params.no_auto_bright = info[0].As<Napi::Boolean>().Value() ? 1 : 0;
    
    return env.Undefined();
}

Napi::Value LibRawProcessor::SetUseCameraWB(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 1 || !info[0].IsBoolean()) {
        Napi::TypeError::New(env, "Expected (boolean useCameraWB)")
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }
    
    processor_->imgdata.params.use_camera_wb = info[0].As<Napi::Boolean>().Value() ? 1 : 0;
    
    return env.Undefined();
}

Napi::Value LibRawProcessor::SetUseAutoWB(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 1 || !info[0].IsBoolean()) {
        Napi::TypeError::New(env, "Expected (boolean useAutoWB)")
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }
    
    processor_->imgdata.params.use_auto_wb = info[0].As<Napi::Boolean>().Value() ? 1 : 0;
    
    return env.Undefined();
}

Napi::Value LibRawProcessor::SetQuality(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 1 || !info[0].IsNumber()) {
        Napi::TypeError::New(env, "Expected (number quality)")
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }
    
    // 0=bilinear, 1=VNG, 2=PPG, 3=AHD, 4=DCB, 11=DHT, 12=AAHD
    processor_->imgdata.params.user_qual = info[0].As<Napi::Number>().Int32Value();
    
    return env.Undefined();
}

Napi::Value LibRawProcessor::SetHighlightMode(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 1 || !info[0].IsNumber()) {
        Napi::TypeError::New(env, "Expected (number mode)")
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }
    
    // 0=clip, 1=unclip, 2=blend, 3+=rebuild
    processor_->imgdata.params.highlight = info[0].As<Napi::Number>().Int32Value();
    
    return env.Undefined();
}

// ============================================================================
// Utility Methods
// ============================================================================

Napi::Value LibRawProcessor::Recycle(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    processor_->recycle();
    is_loaded_ = false;
    is_unpacked_ = false;
    is_processed_ = false;
    
    return Napi::Boolean::New(env, true);
}

Napi::Value LibRawProcessor::Close(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    processor_->recycle();
    is_loaded_ = false;
    is_unpacked_ = false;
    is_processed_ = false;
    
    return Napi::Boolean::New(env, true);
}

Napi::Value LibRawProcessor::IsLoaded(const Napi::CallbackInfo& info) {
    return Napi::Boolean::New(info.Env(), is_loaded_);
}

// ============================================================================
// Module-level Functions
// ============================================================================

Napi::Value GetVersion(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    Napi::Object result = Napi::Object::New(env);
    result.Set("version", Napi::String::New(env, LibRaw::version()));
    result.Set("versionNumber", Napi::Number::New(env, LibRaw::versionNumber()));
    
    return result;
}

Napi::Value GetCameraList(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    const char** list = LibRaw::cameraList();
    int count = LibRaw::cameraCount();
    
    Napi::Array result = Napi::Array::New(env, count);
    for (int i = 0; i < count; i++) {
        result.Set(i, Napi::String::New(env, list[i]));
    }
    
    return result;
}

Napi::Value GetCameraCount(const Napi::CallbackInfo& info) {
    return Napi::Number::New(info.Env(), LibRaw::cameraCount());
}

Napi::Value IsSupportedCamera(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "Expected (string cameraModel)")
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }
    
    std::string model = info[0].As<Napi::String>().Utf8Value();
    const char** list = LibRaw::cameraList();
    int count = LibRaw::cameraCount();
    
    for (int i = 0; i < count; i++) {
        if (model == list[i]) {
            return Napi::Boolean::New(env, true);
        }
    }
    
    return Napi::Boolean::New(env, false);
}

// ============================================================================
// Module Initialization
// ============================================================================

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    // Initialize the LibRawProcessor class
    LibRawProcessor::Init(env, exports);
    
    // Add module-level functions
    exports.Set("getVersion", Napi::Function::New<GetVersion>(env, "getVersion"));
    exports.Set("getCameraList", Napi::Function::New<GetCameraList>(env, "getCameraList"));
    exports.Set("getCameraCount", Napi::Function::New<GetCameraCount>(env, "getCameraCount"));
    exports.Set("isSupportedCamera", Napi::Function::New<IsSupportedCamera>(env, "isSupportedCamera"));
    
    // Color space constants
    Napi::Object colorSpace = Napi::Object::New(env);
    colorSpace.Set("RAW", Napi::Number::New(env, 0));
    colorSpace.Set("SRGB", Napi::Number::New(env, 1));
    colorSpace.Set("ADOBE", Napi::Number::New(env, 2));
    colorSpace.Set("WIDE", Napi::Number::New(env, 3));
    colorSpace.Set("PROPHOTO", Napi::Number::New(env, 4));
    colorSpace.Set("XYZ", Napi::Number::New(env, 5));
    colorSpace.Set("ACES", Napi::Number::New(env, 6));
    colorSpace.Set("DCIP3", Napi::Number::New(env, 7));
    colorSpace.Set("REC2020", Napi::Number::New(env, 8));
    exports.Set("ColorSpace", colorSpace);
    
    // Demosaic quality constants
    Napi::Object quality = Napi::Object::New(env);
    quality.Set("LINEAR", Napi::Number::New(env, 0));
    quality.Set("VNG", Napi::Number::New(env, 1));
    quality.Set("PPG", Napi::Number::New(env, 2));
    quality.Set("AHD", Napi::Number::New(env, 3));
    quality.Set("DCB", Napi::Number::New(env, 4));
    quality.Set("DHT", Napi::Number::New(env, 11));
    quality.Set("AAHD", Napi::Number::New(env, 12));
    exports.Set("DemosaicQuality", quality);
    
    // Highlight mode constants
    Napi::Object highlight = Napi::Object::New(env);
    highlight.Set("CLIP", Napi::Number::New(env, 0));
    highlight.Set("UNCLIP", Napi::Number::New(env, 1));
    highlight.Set("BLEND", Napi::Number::New(env, 2));
    highlight.Set("REBUILD_3", Napi::Number::New(env, 3));
    highlight.Set("REBUILD_5", Napi::Number::New(env, 5));
    highlight.Set("REBUILD_7", Napi::Number::New(env, 7));
    highlight.Set("REBUILD_9", Napi::Number::New(env, 9));
    exports.Set("HighlightMode", highlight);
    
    return exports;
}

NODE_API_MODULE(libraw_native, Init)
