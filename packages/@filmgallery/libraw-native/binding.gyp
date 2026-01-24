{
  "targets": [
    {
      "target_name": "libraw_native",
      "sources": [
        "src/libraw_binding.cpp",
        "src/async_workers.cpp",
        "deps/libraw/src/libraw_c_api.cpp",
        "deps/libraw/src/libraw_datastream.cpp",
        "deps/libraw/src/decoders/canon_600.cpp",
        "deps/libraw/src/decoders/crx.cpp",
        "deps/libraw/src/decoders/decoders_dcraw.cpp",
        "deps/libraw/src/decoders/decoders_libraw.cpp",
        "deps/libraw/src/decoders/decoders_libraw_dcrdefs.cpp",
        "deps/libraw/src/decoders/dng.cpp",
        "deps/libraw/src/decoders/fp_dng.cpp",
        "deps/libraw/src/decoders/fuji_compressed.cpp",
        "deps/libraw/src/decoders/generic.cpp",
        "deps/libraw/src/decoders/kodak_decoders.cpp",
        "deps/libraw/src/decoders/load_mfbacks.cpp",
        "deps/libraw/src/decoders/olympus14.cpp",
        "deps/libraw/src/decoders/pana8.cpp",
        "deps/libraw/src/decoders/smal.cpp",
        "deps/libraw/src/decoders/sonycc.cpp",
        "deps/libraw/src/decoders/unpack.cpp",
        "deps/libraw/src/decoders/unpack_thumb.cpp",
        "deps/libraw/src/decompressors/losslessjpeg.cpp",
        "deps/libraw/src/demosaic/aahd_demosaic.cpp",
        "deps/libraw/src/demosaic/ahd_demosaic.cpp",
        "deps/libraw/src/demosaic/dcb_demosaic.cpp",
        "deps/libraw/src/demosaic/dht_demosaic.cpp",
        "deps/libraw/src/demosaic/misc_demosaic.cpp",
        "deps/libraw/src/demosaic/xtrans_demosaic.cpp",
        "deps/libraw/src/integration/dngsdk_glue.cpp",
        "deps/libraw/src/integration/rawspeed_glue.cpp",
        "deps/libraw/src/metadata/adobepano.cpp",
        "deps/libraw/src/metadata/canon.cpp",
        "deps/libraw/src/metadata/ciff.cpp",
        "deps/libraw/src/metadata/cr3_parser.cpp",
        "deps/libraw/src/metadata/epson.cpp",
        "deps/libraw/src/metadata/exif_gps.cpp",
        "deps/libraw/src/metadata/fuji.cpp",
        "deps/libraw/src/metadata/hasselblad_model.cpp",
        "deps/libraw/src/metadata/identify.cpp",
        "deps/libraw/src/metadata/identify_tools.cpp",
        "deps/libraw/src/metadata/kodak.cpp",
        "deps/libraw/src/metadata/leica.cpp",
        "deps/libraw/src/metadata/makernotes.cpp",
        "deps/libraw/src/metadata/mediumformat.cpp",
        "deps/libraw/src/metadata/minolta.cpp",
        "deps/libraw/src/metadata/misc_parsers.cpp",
        "deps/libraw/src/metadata/nikon.cpp",
        "deps/libraw/src/metadata/normalize_model.cpp",
        "deps/libraw/src/metadata/olympus.cpp",
        "deps/libraw/src/metadata/p1.cpp",
        "deps/libraw/src/metadata/pentax.cpp",
        "deps/libraw/src/metadata/samsung.cpp",
        "deps/libraw/src/metadata/sony.cpp",
        "deps/libraw/src/metadata/tiff.cpp",
        "deps/libraw/src/postprocessing/aspect_ratio.cpp",
        "deps/libraw/src/postprocessing/dcraw_process.cpp",
        "deps/libraw/src/postprocessing/mem_image.cpp",
        "deps/libraw/src/postprocessing/postprocessing_aux.cpp",
        "deps/libraw/src/postprocessing/postprocessing_utils.cpp",
        "deps/libraw/src/postprocessing/postprocessing_utils_dcrdefs.cpp",
        "deps/libraw/src/preprocessing/ext_preprocess.cpp",
        "deps/libraw/src/preprocessing/raw2image.cpp",
        "deps/libraw/src/preprocessing/subtract_black.cpp",
        "deps/libraw/src/tables/cameralist.cpp",
        "deps/libraw/src/tables/colorconst.cpp",
        "deps/libraw/src/tables/colordata.cpp",
        "deps/libraw/src/tables/wblists.cpp",
        "deps/libraw/src/utils/curves.cpp",
        "deps/libraw/src/utils/decoder_info.cpp",
        "deps/libraw/src/utils/init_close_utils.cpp",
        "deps/libraw/src/utils/open.cpp",
        "deps/libraw/src/utils/phaseone_processing.cpp",
        "deps/libraw/src/utils/read_utils.cpp",
        "deps/libraw/src/utils/thumb_utils.cpp",
        "deps/libraw/src/utils/utils_dcraw.cpp",
        "deps/libraw/src/utils/utils_libraw.cpp",
        "deps/libraw/src/write/apply_profile.cpp",
        "deps/libraw/src/write/file_write.cpp",
        "deps/libraw/src/write/tiff_writer.cpp",
        "deps/libraw/src/x3f/x3f_parse_process.cpp",
        "deps/libraw/src/x3f/x3f_utils_patched.cpp"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "deps/libraw",
        "deps/libraw/libraw"
      ],
      "defines": [
        "NAPI_VERSION=8",
        "NAPI_CPP_EXCEPTIONS",
        "NO_JASPER",
        "NO_LCMS",
        "LIBRAW_NODLL",
        "LIBRAW_LIBRARY_BUILD"
      ],
      "conditions": [
        ["OS=='win'", {
          "msvs_settings": {
            "VCCLCompilerTool": {
              "ExceptionHandling": 1,
              "RuntimeLibrary": 2,
              "AdditionalIncludeDirectories": [
                "deps/libraw",
                "deps/libraw/libraw"
              ],
              "PreprocessorDefinitions": [
                "WIN32",
                "_WINDOWS",
                "LIBRAW_NODLL",
                "LIBRAW_LIBRARY_BUILD",
                "NO_JASPER",
                "NO_LCMS"
              ],
              "WarningLevel": 3,
              "DisableSpecificWarnings": ["4819", "4005", "4267", "4244"]
            }
          },
          "libraries": [
            "-lws2_32"
          ],
          "defines": [
            "WIN32",
            "_WINDOWS"
          ]
        }],
        ["OS=='mac'", {
          "xcode_settings": {
            "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
            "GCC_ENABLE_CPP_RTTI": "YES",
            "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
            "CLANG_CXX_LIBRARY": "libc++",
            "MACOSX_DEPLOYMENT_TARGET": "10.13",
            "WARNING_CFLAGS": [
              "-Wno-deprecated-declarations"
            ],
            "OTHER_CPLUSPLUSFLAGS": [
              "-fexceptions",
              "-frtti"
            ]
          }
        }],
        ["OS=='linux'", {
          "cflags_cc": [
            "-fexceptions",
            "-frtti",
            "-std=c++17",
            "-Wno-deprecated-declarations"
          ],
          "libraries": [
            "-lpthread"
          ]
        }]
      ]
    }
  ]
}
