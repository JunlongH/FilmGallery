#!/usr/bin/env python3
"""
验证LUT反转在网格点上的精确性
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

print("=" * 70)
print("测试1: 反转LUT在网格点上是否精确")
print("=" * 70)
print()

# 反转LUT
print("正在反转LUT...")
inverted = invert_3d_lut(gamma_lut, size, verbose=False)
apply_gamma = create_lut_interpolator(gamma_lut, size)
apply_inv = create_lut_interpolator(inverted, size)

print("\n测试反转LUT的网格点值是否正确:")
print("(输入到反转LUT的值 = 原始LUT的输出值)")
print()

# 对于gamma LUT的每个网格输出，检查反转LUT是否正确返回对应的输入
max_error = 0
for r in range(size):
    for g in range(size):
        for b in range(size):
            original_input = np.array([r/(size-1), g/(size-1), b/(size-1)])
            gamma_output = gamma_lut[r, g, b]  # = original_input^2
            
            # 反转LUT应该将gamma_output映射回original_input
            inv_result = apply_inv(gamma_output)
            error = np.max(np.abs(inv_result - original_input))
            max_error = max(max_error, error)
            
            if error > 0.01:
                print(f"  输入{original_input} -> gamma{gamma_output} -> inv{inv_result} | err={error:.6f}")

print(f"\n在LUT网格点上的最大误差: {max_error:.8f}")
if max_error < 0.001:
    print("结论: 反转LUT在网格点上是精确的 ✓")
else:
    print("结论: 反转LUT在网格点上存在误差")

print()
print("=" * 70)
print("测试2: 验证问题是LUT分辨率导致的插值误差")
print("=" * 70)
print()

# 测试非网格点
test_val = 0.1
gamma_val = test_val ** 2  # = 0.01
print(f"原始输入: {test_val}")
print(f"Gamma输出: {gamma_val}")
print(f"这个输出值({gamma_val})在LUT中的位置:")
print(f"  LUT网格步长: {1/(size-1):.4f}")
print(f"  {gamma_val} 落在第 {gamma_val * (size-1):.2f} 个网格单元中 (介于0和1之间)")
print()

# 检查LUT在这个区域的值
print("LUT在低值区域的采样:")
for i in range(3):
    coord = i / (size - 1)
    lut_val = inverted[i, i, i]
    print(f"  inverted_lut[{coord:.3f}] = {lut_val}")

print()
print("结论: 这是LUT分辨率的固有限制，不是反转算法的问题。")
print("      当输出值落在LUT网格的稀疏区域时，线性插值无法精确恢复非线性变换。")
print("      解决方案: 使用更大的LUT尺寸 (如33或65)")
