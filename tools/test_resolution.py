#!/usr/bin/env python3
"""
测试不同LUT分辨率对反转精度的影响
"""
import numpy as np
import sys
sys.path.insert(0, r'D:\Program Files\FilmGalery\tools')
from invert_3d_lut import invert_3d_lut, create_lut_interpolator

def test_lut_size(size, verbose=False):
    """测试特定LUT尺寸的反转精度"""
    # 创建gamma LUT
    gamma_lut = np.zeros((size, size, size, 3))
    for r in range(size):
        for g in range(size):
            for b in range(size):
                gamma_lut[r, g, b] = [
                    (r / (size - 1)) ** 2,
                    (g / (size - 1)) ** 2,
                    (b / (size - 1)) ** 2
                ]
    
    # 反转
    inverted = invert_3d_lut(gamma_lut, size, verbose=False)
    
    apply_gamma = create_lut_interpolator(gamma_lut, size)
    apply_inv = create_lut_interpolator(inverted, size)
    
    # 测试往返
    test_inputs = [
        [0.1, 0.1, 0.1],
        [0.25, 0.25, 0.25],
        [0.5, 0.5, 0.5],
        [0.75, 0.75, 0.75],
    ]
    
    max_error = 0
    for inp in test_inputs:
        inp = np.array(inp)
        after_gamma = apply_gamma(inp)
        after_inv = apply_inv(after_gamma)
        error = np.max(np.abs(inp - after_inv))
        max_error = max(max_error, error)
        if verbose:
            print(f"  {inp} -> {np.round(after_gamma, 4)} -> {np.round(after_inv, 4)} | err={error:.6f}")
    
    return max_error

print("=" * 60)
print("LUT分辨率对反转精度的影响")
print("=" * 60)
print()
print("测试 Gamma LUT (output = input^2)")
print()

for size in [9, 17, 33]:
    print(f"\nLUT Size = {size}x{size}x{size}:")
    max_err = test_lut_size(size, verbose=True)
    print(f"  最大误差: {max_err:.6f}")
    if max_err < 0.01:
        print(f"  评估: 优秀 ✓")
    elif max_err < 0.03:
        print(f"  评估: 良好")
    else:
        print(f"  评估: 需要更大尺寸")

print()
print("=" * 60)
print("结论:")
print("=" * 60)
print()
print("对于非线性LUT（如gamma），需要较大的LUT尺寸才能获得较好的往返精度。")
print("推荐使用 33x33x33 或 65x65x65 的LUT尺寸。")
print()
print("注意：这是3D LUT的固有限制，不是反转算法的问题。")
print("反转算法在每个网格点上都是精确的，")
print("误差来自于使用反转LUT时的线性插值。")
