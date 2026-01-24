/**
 * @filmgallery/libraw-native - Async Worker Implementations
 * 
 * Implementation of asynchronous worker classes for LibRaw operations
 */

#include "async_workers.h"
#include <cstring>

// Note: libraw_strerror is provided by LibRaw library (libraw_c_api.cpp)
// We use extern declaration to reference it
extern "C" const char* libraw_strerror(int errorcode);

// ============================================================================
// LibRawAsyncWorker (Base class)
// ============================================================================

LibRawAsyncWorker::LibRawAsyncWorker(Napi::Function& callback, LibRaw* processor)
    : Napi::AsyncWorker(callback), processor_(processor), error_code_(0) {
}

// ============================================================================
// LoadFileWorker
// ============================================================================

LoadFileWorker::LoadFileWorker(Napi::Function& callback, LibRaw* processor, const std::string& path)
    : LibRawAsyncWorker(callback, processor), file_path_(path) {
}

void LoadFileWorker::Execute() {
    error_code_ = processor_->open_file(file_path_.c_str());
    if (error_code_ != LIBRAW_SUCCESS) {
        error_message_ = std::string("Failed to open file: ") + libraw_strerror(error_code_);
        SetError(error_message_);
    }
}

void LoadFileWorker::OnOK() {
    Napi::HandleScope scope(Env());
    
    Napi::Object result = Napi::Object::New(Env());
    result.Set("success", Napi::Boolean::New(Env(), true));
    result.Set("width", Napi::Number::New(Env(), processor_->imgdata.sizes.width));
    result.Set("height", Napi::Number::New(Env(), processor_->imgdata.sizes.height));
    result.Set("rawWidth", Napi::Number::New(Env(), processor_->imgdata.sizes.raw_width));
    result.Set("rawHeight", Napi::Number::New(Env(), processor_->imgdata.sizes.raw_height));
    
    Callback().Call({Env().Null(), result});
}

// ============================================================================
// LoadBufferWorker
// ============================================================================

LoadBufferWorker::LoadBufferWorker(Napi::Function& callback, LibRaw* processor,
                                   const char* data, size_t size)
    : LibRawAsyncWorker(callback, processor) {
    // Copy buffer data to ensure it remains valid during async execution
    buffer_data_.assign(data, data + size);
}

void LoadBufferWorker::Execute() {
    error_code_ = processor_->open_buffer(buffer_data_.data(), buffer_data_.size());
    if (error_code_ != LIBRAW_SUCCESS) {
        error_message_ = std::string("Failed to open buffer: ") + libraw_strerror(error_code_);
        SetError(error_message_);
    }
}

void LoadBufferWorker::OnOK() {
    Napi::HandleScope scope(Env());
    
    Napi::Object result = Napi::Object::New(Env());
    result.Set("success", Napi::Boolean::New(Env(), true));
    result.Set("width", Napi::Number::New(Env(), processor_->imgdata.sizes.width));
    result.Set("height", Napi::Number::New(Env(), processor_->imgdata.sizes.height));
    
    Callback().Call({Env().Null(), result});
}

// ============================================================================
// UnpackWorker
// ============================================================================

UnpackWorker::UnpackWorker(Napi::Function& callback, LibRaw* processor)
    : LibRawAsyncWorker(callback, processor) {
}

void UnpackWorker::Execute() {
    error_code_ = processor_->unpack();
    if (error_code_ != LIBRAW_SUCCESS) {
        error_message_ = std::string("Failed to unpack: ") + libraw_strerror(error_code_);
        SetError(error_message_);
    }
}

void UnpackWorker::OnOK() {
    Napi::HandleScope scope(Env());
    
    Napi::Object result = Napi::Object::New(Env());
    result.Set("success", Napi::Boolean::New(Env(), true));
    
    Callback().Call({Env().Null(), result});
}

// ============================================================================
// ProcessWorker
// ============================================================================

ProcessWorker::ProcessWorker(Napi::Function& callback, LibRaw* processor)
    : LibRawAsyncWorker(callback, processor) {
}

void ProcessWorker::Execute() {
    // First unpack if not already done
    if (!processor_->imgdata.image) {
        error_code_ = processor_->unpack();
        if (error_code_ != LIBRAW_SUCCESS) {
            error_message_ = std::string("Failed to unpack: ") + libraw_strerror(error_code_);
            SetError(error_message_);
            return;
        }
    }
    
    // Process the image (demosaicing, white balance, etc.)
    error_code_ = processor_->dcraw_process();
    if (error_code_ != LIBRAW_SUCCESS) {
        error_message_ = std::string("Failed to process: ") + libraw_strerror(error_code_);
        SetError(error_message_);
    }
}

void ProcessWorker::OnOK() {
    Napi::HandleScope scope(Env());
    
    Napi::Object result = Napi::Object::New(Env());
    result.Set("success", Napi::Boolean::New(Env(), true));
    result.Set("width", Napi::Number::New(Env(), processor_->imgdata.sizes.width));
    result.Set("height", Napi::Number::New(Env(), processor_->imgdata.sizes.height));
    result.Set("iwidth", Napi::Number::New(Env(), processor_->imgdata.sizes.iwidth));
    result.Set("iheight", Napi::Number::New(Env(), processor_->imgdata.sizes.iheight));
    
    Callback().Call({Env().Null(), result});
}

// ============================================================================
// MakeMemImageWorker
// ============================================================================

MakeMemImageWorker::MakeMemImageWorker(Napi::Function& callback, LibRaw* processor)
    : LibRawAsyncWorker(callback, processor), image_(nullptr) {
}

MakeMemImageWorker::~MakeMemImageWorker() {
    // Note: Don't free image_ here as it's transferred to JS
}

void MakeMemImageWorker::Execute() {
    image_ = processor_->dcraw_make_mem_image(&error_code_);
    if (error_code_ != LIBRAW_SUCCESS || !image_) {
        error_message_ = std::string("Failed to make memory image: ") + libraw_strerror(error_code_);
        SetError(error_message_);
    }
}

void MakeMemImageWorker::OnOK() {
    Napi::HandleScope scope(Env());
    
    if (!image_) {
        Napi::Error::New(Env(), "No image data").ThrowAsJavaScriptException();
        return;
    }
    
    Napi::Object result = Napi::Object::New(Env());
    result.Set("success", Napi::Boolean::New(Env(), true));
    result.Set("width", Napi::Number::New(Env(), image_->width));
    result.Set("height", Napi::Number::New(Env(), image_->height));
    result.Set("colors", Napi::Number::New(Env(), image_->colors));
    result.Set("bits", Napi::Number::New(Env(), image_->bits));
    result.Set("type", Napi::Number::New(Env(), image_->type));
    
    // Create buffer with image data
    size_t data_size = image_->data_size;
    Napi::Buffer<unsigned char> buffer = Napi::Buffer<unsigned char>::Copy(
        Env(), image_->data, data_size
    );
    result.Set("data", buffer);
    result.Set("dataSize", Napi::Number::New(Env(), data_size));
    
    // Free the image now that we've copied the data
    LibRaw::dcraw_clear_mem(image_);
    image_ = nullptr;
    
    Callback().Call({Env().Null(), result});
}

// ============================================================================
// UnpackThumbnailWorker
// ============================================================================

UnpackThumbnailWorker::UnpackThumbnailWorker(Napi::Function& callback, LibRaw* processor)
    : LibRawAsyncWorker(callback, processor) {
}

void UnpackThumbnailWorker::Execute() {
    error_code_ = processor_->unpack_thumb();
    if (error_code_ != LIBRAW_SUCCESS) {
        // Not an error if no thumbnail - just report it
        if (error_code_ == LIBRAW_NO_THUMBNAIL) {
            error_message_ = "No thumbnail available";
        } else {
            error_message_ = std::string("Failed to unpack thumbnail: ") + libraw_strerror(error_code_);
        }
        SetError(error_message_);
    }
}

void UnpackThumbnailWorker::OnOK() {
    Napi::HandleScope scope(Env());
    
    Napi::Object result = Napi::Object::New(Env());
    result.Set("success", Napi::Boolean::New(Env(), true));
    result.Set("width", Napi::Number::New(Env(), processor_->imgdata.thumbnail.twidth));
    result.Set("height", Napi::Number::New(Env(), processor_->imgdata.thumbnail.theight));
    result.Set("format", Napi::Number::New(Env(), processor_->imgdata.thumbnail.tformat));
    
    Callback().Call({Env().Null(), result});
}

// ============================================================================
// MakeMemThumbnailWorker
// ============================================================================

MakeMemThumbnailWorker::MakeMemThumbnailWorker(Napi::Function& callback, LibRaw* processor)
    : LibRawAsyncWorker(callback, processor), image_(nullptr) {
}

MakeMemThumbnailWorker::~MakeMemThumbnailWorker() {
    // Note: Don't free image_ here as it's transferred to JS
}

void MakeMemThumbnailWorker::Execute() {
    image_ = processor_->dcraw_make_mem_thumb(&error_code_);
    if (error_code_ != LIBRAW_SUCCESS || !image_) {
        error_message_ = std::string("Failed to make memory thumbnail: ") + libraw_strerror(error_code_);
        SetError(error_message_);
    }
}

void MakeMemThumbnailWorker::OnOK() {
    Napi::HandleScope scope(Env());
    
    if (!image_) {
        Napi::Error::New(Env(), "No thumbnail data").ThrowAsJavaScriptException();
        return;
    }
    
    Napi::Object result = Napi::Object::New(Env());
    result.Set("success", Napi::Boolean::New(Env(), true));
    result.Set("width", Napi::Number::New(Env(), image_->width));
    result.Set("height", Napi::Number::New(Env(), image_->height));
    result.Set("colors", Napi::Number::New(Env(), image_->colors));
    result.Set("bits", Napi::Number::New(Env(), image_->bits));
    result.Set("type", Napi::Number::New(Env(), image_->type));
    
    // Create buffer with thumbnail data
    size_t data_size = image_->data_size;
    Napi::Buffer<unsigned char> buffer = Napi::Buffer<unsigned char>::Copy(
        Env(), image_->data, data_size
    );
    result.Set("data", buffer);
    result.Set("dataSize", Napi::Number::New(Env(), data_size));
    
    // Free the image now that we've copied the data
    LibRaw::dcraw_clear_mem(image_);
    image_ = nullptr;
    
    Callback().Call({Env().Null(), result});
}
