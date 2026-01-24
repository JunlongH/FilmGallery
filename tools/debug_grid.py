#!/usr/bin/env python3
"""
验证反转LUT的网格采样问题
"""
import numpy as np
import sys
sys.path.insert(0, r'D:\Program Files\FilmGalery\tools')
from invert_3d_lut import invert_3d_lut, create_lut_interpolator

# 创建gamma LUT
size = 9
gamma_lut = np.zeros((size, size, size, 3))
for r in range(size):
    for g in range(size):
        for b in range(size):
            gamma_lut[r, g, b] = [
                (r / (size - 1)) ** 2,
                (g / (size - 1)) ** 2,
                (b / (size - 1)) ** 2
            ]

print("反转LUT (size=9)")
print("=" * 60)
inverted = invert_3d_lut(gamma_lut, size, verbose=False)

print("\n反转LUT在网格点上存储的值:")
print("(反转LUT的索引i对应坐标 i/(size-1))")
print()
for i in range(size):
    coord = i / (size - 1)
    val = inverted[i, i, i]
    print(f"inverted_lut[{i}] = inverted_lut[{coord:.4f}] = {val}")

print()
print("=" * 60)
print("分析问题:")
print("=" * 60)
print()
print("反转LUT需要在坐标 0.015625 处返回 0.125")
print("但反转LUT的网格是: 0.000, 0.125, 0.250, ...")
print("0.015625 落在 [0.000, 0.125] 之间")
print()
print("反转LUT在 0.000 处存储: ", inverted[0, 0, 0])
print("反转LUT在 0.125 处存储: ", inverted[1, 1, 1])
print()
print("线性插值: 0.015625 在 [0, 0.125] 中的位置 = 0.015625/0.125 = 0.125")
print("插值结果 = 0.0 * (1-0.125) + 0.35 * 0.125 = ", 0.0 * 0.875 + 0.35 * 0.125)
print()
print("但我们期望的结果是 0.125！")
print()
print("=" * 60)
print("根本原因:")
print("=" * 60)
print()
print("反转LUT在索引1（坐标0.125）处应该存储什么值？")
print()
print("反转LUT[0.125] 应该是使得 gamma(x) = 0.125 的那个 x")
print("gamma(x) = x^2 = 0.125")
print("x = sqrt(0.125) = ", np.sqrt(0.125))
print()
print("当前存储的值是:", inverted[1, 1, 1])
print("这是正确的！")
print()
print("=" * 60)
print("结论:")
print("=" * 60)
print()
print("问题不在于反转LUT的计算，而在于LUT的分辨率。")
print()
print("当我们查询 apply_inv(0.015625) 时:")
print("  - 0.015625 在反转LUT中落在 [0, 0.125] 区间")
print("  - 线性插值在 inv[0]=0 和 inv[0.125]=0.35 之间")
print("  - 插值结果 ≈ 0.044")
print()
print("但正确答案 0.125 无法通过线性插值在这两个值之间得到！")
print()
print("这是因为反转函数（sqrt）在0附近变化很快，")
print("线性插值无法准确表示这种非线性变化。")
print()
print("解决方案：增加LUT分辨率")
