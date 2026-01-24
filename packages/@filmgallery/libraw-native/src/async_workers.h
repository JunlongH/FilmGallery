/**
 * @filmgallery/libraw-native - Async Worker Definitions
 * 
 * Asynchronous worker classes for non-blocking LibRaw operations
 */

#ifndef ASYNC_WORKERS_H
#define ASYNC_WORKERS_H

#include <napi.h>
#include "libraw/libraw.h"
#include <string>
#include <vector>

/**
 * Base worker class for LibRaw operations
 */
class LibRawAsyncWorker : public Napi::AsyncWorker {
public:
    LibRawAsyncWorker(Napi::Function& callback, LibRaw* processor);
    
protected:
    LibRaw* processor_;
    int error_code_;
    std::string error_message_;
};

/**
 * Async worker for loading RAW files
 */
class LoadFileWorker : public LibRawAsyncWorker {
public:
    LoadFileWorker(Napi::Function& callback, LibRaw* processor, const std::string& path);
    
    void Execute() override;
    void OnOK() override;
    
private:
    std::string file_path_;
};

/**
 * Async worker for loading RAW from buffer
 */
class LoadBufferWorker : public LibRawAsyncWorker {
public:
    LoadBufferWorker(Napi::Function& callback, LibRaw* processor, 
                     const char* data, size_t size);
    
    void Execute() override;
    void OnOK() override;
    
private:
    std::vector<char> buffer_data_;
};

/**
 * Async worker for unpacking RAW data
 */
class UnpackWorker : public LibRawAsyncWorker {
public:
    UnpackWorker(Napi::Function& callback, LibRaw* processor);
    
    void Execute() override;
    void OnOK() override;
};

/**
 * Async worker for processing (dcraw_process)
 */
class ProcessWorker : public LibRawAsyncWorker {
public:
    ProcessWorker(Napi::Function& callback, LibRaw* processor);
    
    void Execute() override;
    void OnOK() override;
};

/**
 * Async worker for creating in-memory image
 */
class MakeMemImageWorker : public LibRawAsyncWorker {
public:
    MakeMemImageWorker(Napi::Function& callback, LibRaw* processor);
    ~MakeMemImageWorker();
    
    void Execute() override;
    void OnOK() override;
    
private:
    libraw_processed_image_t* image_;
};

/**
 * Async worker for unpacking thumbnail
 */
class UnpackThumbnailWorker : public LibRawAsyncWorker {
public:
    UnpackThumbnailWorker(Napi::Function& callback, LibRaw* processor);
    
    void Execute() override;
    void OnOK() override;
};

/**
 * Async worker for creating thumbnail in memory
 */
class MakeMemThumbnailWorker : public LibRawAsyncWorker {
public:
    MakeMemThumbnailWorker(Napi::Function& callback, LibRaw* processor);
    ~MakeMemThumbnailWorker();
    
    void Execute() override;
    void OnOK() override;
    
private:
    libraw_processed_image_t* image_;
};

/**
 * Helper to convert libraw error code to string
 */
const char* libraw_strerror(int errorcode);

#endif // ASYNC_WORKERS_H
