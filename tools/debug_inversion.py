#!/usr/bin/env python3
"""
调试反转LUT的问题
"""
import numpy as np
import sys
sys.path.insert(0, r'D:\Program Files\FilmGalery\tools')
from invert_3d_lut import create_lut_interpolator

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

print("原始Gamma LUT的网格点:")
print("位置 (r,g,b) -> 输出值 (即LUT存储的值)")
for i in range(3):
    coord = i / (size - 1)
    val = gamma_lut[i, i, i]
    print(f"  [{coord:.4f}, {coord:.4f}, {coord:.4f}] -> {val}")

print()
print("=" * 60)
print("对于反转LUT，我们需要:")
print("反转LUT[gamma输出] = 原始输入")
print("=" * 60)
print()

# 手动构建正确的反转LUT
print("正确的反转LUT应该在以下位置存储以下值:")
print("(反转LUT的索引位置 = gamma LUT的输出值)")
print()
for r in range(size):
    for g in range(size):
        for b in range(size):
            original_input = np.array([r/(size-1), g/(size-1), b/(size-1)])
            gamma_output = gamma_lut[r, g, b]
            if r == g == b and r < 4:
                print(f"反转LUT在位置 {gamma_output} 应存储 {original_input}")

print()
print("=" * 60)
print("关键问题分析:")
print("=" * 60)
print()
print("gamma LUT的输出范围是 [0, 1]")
print("但输出分布不均匀（因为是平方）：")
print()

# 显示gamma输出的分布
gamma_outputs = []
for i in range(size):
    val = (i / (size - 1)) ** 2
    gamma_outputs.append(val)
    print(f"  输入 {i/(size-1):.4f} -> 输出 {val:.6f}")

print()
print("输出值在0附近非常密集，在1附近稀疏")
print("这导致反转LUT需要在0附近有更高的分辨率")

print()
print("=" * 60)
print("检查反转求解是否正确工作:")
print("=" * 60)

from invert_3d_lut import solve_inverse_newton, solve_inverse_optimization, build_inverse_estimator

apply_gamma = create_lut_interpolator(gamma_lut, size)
estimate_inverse = build_inverse_estimator(gamma_lut, size)

# 测试求解
test_targets = [
    np.array([0.0, 0.0, 0.0]),
    np.array([0.015625, 0.015625, 0.015625]),  # 对应输入 0.125
    np.array([0.0625, 0.0625, 0.0625]),        # 对应输入 0.25
    np.array([0.25, 0.25, 0.25]),              # 对应输入 0.5
]

expected_inputs = [
    np.array([0.0, 0.0, 0.0]),
    np.array([0.125, 0.125, 0.125]),
    np.array([0.25, 0.25, 0.25]),
    np.array([0.5, 0.5, 0.5]),
]

print()
for target, expected in zip(test_targets, expected_inputs):
    # 初始估计
    initial = estimate_inverse(target)
    
    # 牛顿求解
    result = solve_inverse_newton(target, apply_gamma, initial)
    
    # 验证
    check = apply_gamma(result)
    error = np.max(np.abs(check - target))
    
    print(f"目标: {target}")
    print(f"  初始估计: {initial}")
    print(f"  牛顿结果: {result}")
    print(f"  期望结果: {expected}")
    print(f"  验证 apply_gamma(result) = {check}")
    print(f"  误差: {error:.8f}")
    print()
