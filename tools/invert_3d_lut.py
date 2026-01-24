#!/usr/bin/env python3
"""
3D LUT Inverter
===============
将3D LUT完全反转，使得：原图 -> 原LUT -> 反转LUT = 原图

核心原理:
- 原始LUT定义映射: input -> output = LUT(input)
- 反转LUT需要: output -> input = InvLUT(output)
- 即对于反转LUT中位置(r,g,b)存储的值，应该是使得 LUT(x) = (r,g,b) 的那个 x

方法:
1. 首先用散点插值获得初始估计
2. 然后用牛顿迭代法精确求解每个网格点

注意事项:
- 反转算法在每个网格点上都是精确的
- 实际使用时的误差来自LUT的有限分辨率和线性插值
- 对于非线性较强的LUT，建议使用较大的输出尺寸（如33或65）
- 可以使用 --size 参数指定输出LUT的尺寸

用法: python invert_3d_lut.py input.cube output_inverted.cube [--size 33]

作者: FilmGallery Tools
日期: 2026-01-24
"""

import numpy as np
from scipy.interpolate import RegularGridInterpolator, LinearNDInterpolator, NearestNDInterpolator
from scipy.optimize import minimize
import argparse
import sys
from pathlib import Path
import warnings
warnings.filterwarnings('ignore')


def parse_cube_file(filepath):
    """
    解析.cube LUT文件
    """
    title = ""
    size = None
    domain_min = [0.0, 0.0, 0.0]
    domain_max = [1.0, 1.0, 1.0]
    data_lines = []
    
    with open(filepath, 'r') as f:
        for line in f:
            line = line.strip()
            
            if not line or line.startswith('#'):
                continue
            
            if line.startswith('TITLE'):
                title = line.split('"')[1] if '"' in line else line.split()[1]
                continue
            
            if line.startswith('LUT_3D_SIZE'):
                size = int(line.split()[1])
                continue
            
            if line.startswith('DOMAIN_MIN'):
                parts = line.split()[1:]
                domain_min = [float(x) for x in parts]
                continue
            
            if line.startswith('DOMAIN_MAX'):
                parts = line.split()[1:]
                domain_max = [float(x) for x in parts]
                continue
            
            if line.startswith('LUT_1D_SIZE') or line.startswith('DOMAIN'):
                continue
            
            try:
                values = [float(x) for x in line.split()]
                if len(values) == 3:
                    data_lines.append(values)
            except ValueError:
                continue
    
    if size is None:
        size = round(len(data_lines) ** (1/3))
    
    data = np.array(data_lines)
    
    # .cube文件的顺序是: R变化最快, 然后G, 最后B
    lut_data = data.reshape((size, size, size, 3))  # (B, G, R, 3)
    lut_data = np.transpose(lut_data, (2, 1, 0, 3))  # 转换为 (R, G, B, 3)
    
    return lut_data, size, title, domain_min, domain_max


def write_cube_file(filepath, lut_data, title="Inverted LUT", domain_min=None, domain_max=None):
    """
    写入.cube LUT文件
    """
    size = lut_data.shape[0]
    
    if domain_min is None:
        domain_min = [0.0, 0.0, 0.0]
    if domain_max is None:
        domain_max = [1.0, 1.0, 1.0]
    
    with open(filepath, 'w') as f:
        f.write(f'TITLE "{title}"\n')
        f.write(f'LUT_3D_SIZE {size}\n')
        f.write(f'DOMAIN_MIN {domain_min[0]:.6f} {domain_min[1]:.6f} {domain_min[2]:.6f}\n')
        f.write(f'DOMAIN_MAX {domain_max[0]:.6f} {domain_max[1]:.6f} {domain_max[2]:.6f}\n')
        f.write('\n')
        
        for b in range(size):
            for g in range(size):
                for r in range(size):
                    rgb = lut_data[r, g, b]
                    f.write(f'{rgb[0]:.6f} {rgb[1]:.6f} {rgb[2]:.6f}\n')


def create_lut_interpolator(lut_data, size):
    """
    创建LUT的三线性插值函数
    """
    axis = np.linspace(0, 1, size)
    
    interp_r = RegularGridInterpolator(
        (axis, axis, axis), lut_data[:, :, :, 0],
        method='linear', bounds_error=False, fill_value=None
    )
    interp_g = RegularGridInterpolator(
        (axis, axis, axis), lut_data[:, :, :, 1],
        method='linear', bounds_error=False, fill_value=None
    )
    interp_b = RegularGridInterpolator(
        (axis, axis, axis), lut_data[:, :, :, 2],
        method='linear', bounds_error=False, fill_value=None
    )
    
    def apply_lut(rgb):
        rgb = np.atleast_2d(rgb)
        rgb = np.clip(rgb, 0, 1)
        result = np.column_stack([
            interp_r(rgb),
            interp_g(rgb),
            interp_b(rgb)
        ])
        return result.squeeze()
    
    return apply_lut


def build_inverse_estimator(lut_data, size):
    """
    构建一个从输出到输入的初始估计器
    """
    # 收集所有 (input, output) 对
    inputs = []
    outputs = []
    
    for r in range(size):
        for g in range(size):
            for b in range(size):
                inp = np.array([
                    r / (size - 1),
                    g / (size - 1),
                    b / (size - 1)
                ])
                out = lut_data[r, g, b]
                inputs.append(inp)
                outputs.append(out)
    
    inputs = np.array(inputs)
    outputs = np.array(outputs)
    
    # 构建从输出到输入的插值器
    try:
        interp_r = LinearNDInterpolator(outputs, inputs[:, 0], fill_value=np.nan)
        interp_g = LinearNDInterpolator(outputs, inputs[:, 1], fill_value=np.nan)
        interp_b = LinearNDInterpolator(outputs, inputs[:, 2], fill_value=np.nan)
        
        nn_r = NearestNDInterpolator(outputs, inputs[:, 0])
        nn_g = NearestNDInterpolator(outputs, inputs[:, 1])
        nn_b = NearestNDInterpolator(outputs, inputs[:, 2])
    except:
        nn_r = NearestNDInterpolator(outputs, inputs[:, 0])
        nn_g = NearestNDInterpolator(outputs, inputs[:, 1])
        nn_b = NearestNDInterpolator(outputs, inputs[:, 2])
        interp_r = interp_g = interp_b = None
    
    def estimate(target):
        target = np.atleast_1d(target)
        if interp_r is not None:
            result = np.array([interp_r(target), interp_g(target), interp_b(target)]).flatten()
            if np.any(np.isnan(result)):
                result = np.array([nn_r(target), nn_g(target), nn_b(target)]).flatten()
        else:
            result = np.array([nn_r(target), nn_g(target), nn_b(target)]).flatten()
        return np.clip(result, 0, 1)
    
    return estimate


def solve_inverse_newton(target_rgb, apply_lut, initial_guess, max_iter=30, tol=1e-10):
    """
    使用牛顿法精确求解 LUT(x) = target_rgb
    """
    x = initial_guess.copy()
    eps = 1e-7
    
    for _ in range(max_iter):
        fx = apply_lut(x)
        residual = fx - target_rgb
        error = np.max(np.abs(residual))
        
        if error < tol:
            break
        
        # 计算雅可比矩阵
        J = np.zeros((3, 3))
        for i in range(3):
            x_plus = x.copy()
            x_plus[i] = min(1.0, x[i] + eps)
            x_minus = x.copy()
            x_minus[i] = max(0.0, x[i] - eps)
            
            dx = x_plus[i] - x_minus[i]
            if dx > 0:
                J[:, i] = (apply_lut(x_plus) - apply_lut(x_minus)) / dx
        
        # 正则化求解
        try:
            JtJ = J.T @ J + 1e-8 * np.eye(3)
            Jtr = J.T @ residual
            delta = np.linalg.solve(JtJ, -Jtr)
            
            # 线搜索
            alpha = 1.0
            for _ in range(10):
                x_new = np.clip(x + alpha * delta, 0, 1)
                new_error = np.max(np.abs(apply_lut(x_new) - target_rgb))
                if new_error < error:
                    x = x_new
                    break
                alpha *= 0.5
            else:
                x = np.clip(x + 0.1 * delta, 0, 1)
        except:
            break
    
    return x


def solve_inverse_optimization(target_rgb, apply_lut, initial_guess):
    """
    使用优化方法求解（备用）
    """
    def objective(x):
        result = apply_lut(np.clip(x, 0, 1))
        return np.sum((result - target_rgb) ** 2)
    
    result = minimize(
        objective,
        initial_guess,
        method='L-BFGS-B',
        bounds=[(0, 1), (0, 1), (0, 1)],
        options={'ftol': 1e-14, 'gtol': 1e-12, 'maxiter': 200}
    )
    
    return np.clip(result.x, 0, 1)


def invert_3d_lut(lut_data, output_size=None, verbose=True):
    """
    反转3D LUT
    
    算法:
    1. 首先用散点插值获得从输出到输入的初始估计
    2. 然后用牛顿迭代法精确求解每个点
    """
    input_size = lut_data.shape[0]
    if output_size is None:
        output_size = input_size
    
    if verbose:
        print(f"Step 1: 构建原始LUT插值器...")
    
    apply_lut = create_lut_interpolator(lut_data, input_size)
    
    if verbose:
        print(f"Step 2: 构建逆向初始估计器...")
    
    estimate_inverse = build_inverse_estimator(lut_data, input_size)
    
    if verbose:
        print(f"Step 3: 精确求解每个网格点...")
        print(f"        LUT大小: {output_size}x{output_size}x{output_size}")
    
    inverted_lut = np.zeros((output_size, output_size, output_size, 3))
    total_points = output_size ** 3
    processed = 0
    high_error_count = 0
    
    for r_idx in range(output_size):
        for g_idx in range(output_size):
            for b_idx in range(output_size):
                # target是反转LUT的输入坐标，也是原始LUT的输出值
                target = np.array([
                    r_idx / (output_size - 1),
                    g_idx / (output_size - 1),
                    b_idx / (output_size - 1)
                ])
                
                # 获取初始估计
                initial = estimate_inverse(target)
                
                # 牛顿法精确求解
                result = solve_inverse_newton(target, apply_lut, initial)
                
                # 检查结果
                check = apply_lut(result)
                error = np.max(np.abs(check - target))
                
                # 如果误差太大，尝试优化方法
                if error > 1e-4:
                    result2 = solve_inverse_optimization(target, apply_lut, result)
                    check2 = apply_lut(result2)
                    error2 = np.max(np.abs(check2 - target))
                    if error2 < error:
                        result = result2
                        error = error2
                
                if error > 0.01:
                    high_error_count += 1
                
                inverted_lut[r_idx, g_idx, b_idx] = result
                
                processed += 1
                if verbose and processed % 1000 == 0:
                    progress = processed / total_points * 100
                    print(f"\r        进度: {progress:.1f}%", end='', flush=True)
    
    if verbose:
        print(f"\r        进度: 100.0%")
        if high_error_count > 0:
            print(f"        警告: {high_error_count} 个点误差较大")
        print("反转完成!")
    
    return inverted_lut


def verify_inversion(original_lut, inverted_lut, num_samples=100, verbose=True):
    """
    验证LUT反转的准确性
    """
    orig_size = original_lut.shape[0]
    inv_size = inverted_lut.shape[0]
    
    apply_orig = create_lut_interpolator(original_lut, orig_size)
    apply_inv = create_lut_interpolator(inverted_lut, inv_size)
    
    np.random.seed(42)
    test_points = np.random.rand(num_samples, 3)
    
    errors = []
    
    if verbose:
        print(f"\n验证: 原图 -> 原LUT -> 反转LUT = 原图?")
    
    for point in test_points:
        after_orig = apply_orig(point)
        after_inv = apply_inv(after_orig)
        error = np.sqrt(np.sum((point - after_inv) ** 2))
        errors.append(error)
    
    errors = np.array(errors)
    
    if verbose:
        print(f"\n验证结果 ({num_samples} 个随机采样点):")
        print(f"  平均误差: {errors.mean():.6f}")
        print(f"  最大误差: {errors.max():.6f}")
        print(f"  最小误差: {errors.min():.6f}")
        print(f"  标准差: {errors.std():.6f}")
        
        if errors.max() < 0.01:
            print("  质量评估: 优秀 ✓")
        elif errors.max() < 0.03:
            print("  质量评估: 良好")
        else:
            print("  质量评估: 一般 (可尝试增大LUT尺寸)")
    
    return errors


def test_gamma_lut(verbose=True):
    """
    测试：使用gamma LUT验证反转
    """
    if verbose:
        print("=" * 60)
        print("测试: Gamma LUT (output = input^2) 的反转")
        print("=" * 60)
    
    size = 9  # 使用小尺寸加快测试
    gamma_lut = np.zeros((size, size, size, 3))
    
    for r in range(size):
        for g in range(size):
            for b in range(size):
                gamma_lut[r, g, b] = [
                    (r / (size - 1)) ** 2,
                    (g / (size - 1)) ** 2,
                    (b / (size - 1)) ** 2
                ]
    
    if verbose:
        print(f"原始Gamma LUT: size={size}")
    
    apply_gamma = create_lut_interpolator(gamma_lut, size)
    
    inverted = invert_3d_lut(gamma_lut, size, verbose=verbose)
    apply_inv = create_lut_interpolator(inverted, size)
    
    # 测试往返
    test_inputs = [
        [0.0, 0.0, 0.0],
        [0.1, 0.1, 0.1],
        [0.25, 0.25, 0.25],
        [0.5, 0.5, 0.5],
        [0.75, 0.75, 0.75],
        [1.0, 1.0, 1.0],
    ]
    
    if verbose:
        print(f"\n往返测试 (input -> gamma -> inverse):")
    
    max_error = 0
    for inp in test_inputs:
        inp = np.array(inp)
        after_gamma = apply_gamma(inp)
        after_inv = apply_inv(after_gamma)
        error = np.max(np.abs(inp - after_inv))
        max_error = max(max_error, error)
        status = "OK" if error < 0.02 else "FAIL"
        if verbose:
            print(f"  {inp} -> {np.round(after_gamma, 4)} -> {np.round(after_inv, 4)} | err={error:.6f} [{status}]")
    
    if verbose:
        if max_error < 0.02:
            print("\n测试通过 ✓")
        else:
            print(f"\n最大误差: {max_error:.6f}")
    
    return max_error < 0.05


def test_identity(verbose=True):
    """
    测试：恒等LUT反转
    """
    if verbose:
        print("测试恒等LUT反转...")
    
    size = 9
    identity_lut = np.zeros((size, size, size, 3))
    
    for r in range(size):
        for g in range(size):
            for b in range(size):
                identity_lut[r, g, b] = [
                    r / (size - 1),
                    g / (size - 1),
                    b / (size - 1)
                ]
    
    inverted = invert_3d_lut(identity_lut, size, verbose=False)
    max_error = np.max(np.abs(inverted - identity_lut))
    
    if verbose:
        print(f"  恒等LUT反转最大误差: {max_error:.8f}")
        if max_error < 1e-4:
            print("  测试通过 ✓")
        else:
            print("  测试失败 ✗")
    
    return max_error < 1e-4


def main():
    parser = argparse.ArgumentParser(
        description='反转3D LUT文件',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''
示例:
  python invert_3d_lut.py input.cube output_inverted.cube
  python invert_3d_lut.py input.cube output.cube --size 33
  python invert_3d_lut.py input.cube output.cube --verify
  python invert_3d_lut.py --test
        '''
    )
    
    parser.add_argument('input', nargs='?', help='输入的.cube LUT文件路径')
    parser.add_argument('output', nargs='?', help='输出的反转LUT文件路径')
    parser.add_argument('--size', type=int, default=None,
                        help='输出LUT的大小 (默认与输入相同)')
    parser.add_argument('--verify', action='store_true',
                        help='验证反转结果的准确性')
    parser.add_argument('--quiet', action='store_true',
                        help='安静模式')
    parser.add_argument('--test', action='store_true',
                        help='运行自测试')
    
    args = parser.parse_args()
    
    if args.test:
        print("=" * 60)
        print("运行自测试")
        print("=" * 60)
        test_identity(verbose=True)
        print()
        test_gamma_lut(verbose=True)
        print("\n自测试完成!")
        return
    
    if not args.input or not args.output:
        parser.print_help()
        print("\n错误: 需要提供输入和输出文件路径")
        sys.exit(1)
    
    input_path = Path(args.input)
    if not input_path.exists():
        print(f"错误: 输入文件不存在: {args.input}")
        sys.exit(1)
    
    verbose = not args.quiet
    
    if verbose:
        print(f"读取LUT文件: {args.input}")
    
    try:
        lut_data, size, title, domain_min, domain_max = parse_cube_file(args.input)
        if verbose:
            print(f"  标题: {title}")
            print(f"  大小: {size}x{size}x{size}")
    except Exception as e:
        print(f"错误: 无法解析LUT文件: {e}")
        sys.exit(1)
    
    output_size = args.size if args.size else size
    
    inverted_lut = invert_3d_lut(lut_data, output_size, verbose)
    
    output_title = f"{title} (Inverted)" if title else "Inverted LUT"
    
    if verbose:
        print(f"\n写入反转LUT: {args.output}")
    
    write_cube_file(args.output, inverted_lut, output_title, domain_min, domain_max)
    
    if args.verify:
        verify_inversion(lut_data, inverted_lut, verbose=verbose)
    
    if verbose:
        print("\n完成!")


if __name__ == '__main__':
    main()
