#!/usr/bin/env python3
"""
Quick test script for LUT inversion with small LUT
"""
import numpy as np
from scipy.interpolate import RegularGridInterpolator

def create_lut_interpolator(lut_data, size):
    axis = np.linspace(0, 1, size)
    interp_r = RegularGridInterpolator((axis, axis, axis), lut_data[:,:,:,0], method='linear', bounds_error=False, fill_value=None)
    interp_g = RegularGridInterpolator((axis, axis, axis), lut_data[:,:,:,1], method='linear', bounds_error=False, fill_value=None)
    interp_b = RegularGridInterpolator((axis, axis, axis), lut_data[:,:,:,2], method='linear', bounds_error=False, fill_value=None)
    
    def apply_lut(rgb):
        rgb = np.atleast_2d(rgb)
        rgb = np.clip(rgb, 0, 1)
        result = np.column_stack([interp_r(rgb), interp_g(rgb), interp_b(rgb)])
        return result.squeeze()
    
    return apply_lut

# Create a simple gamma LUT: output = input^2
size = 5  # Small for quick test
gamma_lut = np.zeros((size, size, size, 3))
for r in range(size):
    for g in range(size):
        for b in range(size):
            gamma_lut[r, g, b] = [
                (r / (size - 1)) ** 2,
                (g / (size - 1)) ** 2,
                (b / (size - 1)) ** 2
            ]

apply_gamma = create_lut_interpolator(gamma_lut, size)

print("=" * 60)
print("Testing Gamma LUT (output = input^2)")
print("=" * 60)

# Test the gamma LUT
test_input = np.array([0.5, 0.5, 0.5])
output = apply_gamma(test_input)
print(f"Input: {test_input}")
print(f"Output (should be ~0.25): {output}")
print()

# Now run the current inversion script
import sys
sys.path.insert(0, r'D:\Program Files\FilmGalery\tools')
from invert_3d_lut import invert_3d_lut, create_lut_interpolator as create_interp

print("Running inversion on 5x5x5 LUT...")
inverted_lut = invert_3d_lut(gamma_lut, size, verbose=True)
apply_inverted = create_interp(inverted_lut, size)

print("\nTesting inverse LUT:")
print("-" * 40)

# The inverse of gamma=2 should be gamma=0.5 (square root)
test_vals = [0.0, 0.25, 0.5, 0.75, 1.0]
for val in test_vals:
    inv_input = np.array([val, val, val])
    inv_output = apply_inverted(inv_input)
    expected = np.sqrt(val)
    print(f"Inverted LUT input: {val:.2f} -> output: {inv_output[0]:.4f} (expected sqrt: {expected:.4f})")

print("\n" + "=" * 60)
print("Testing roundtrip: input -> gamma -> inverted = input?")
print("=" * 60)
test_inputs = [
    [0.0, 0.0, 0.0],
    [0.25, 0.25, 0.25],
    [0.5, 0.5, 0.5],
    [0.75, 0.75, 0.75],
    [1.0, 1.0, 1.0],
    [0.3, 0.6, 0.9],
]

all_pass = True
for inp in test_inputs:
    inp = np.array(inp)
    after_gamma = apply_gamma(inp)
    after_inv = apply_inverted(after_gamma)
    error = np.max(np.abs(inp - after_inv))
    status = "OK" if error < 0.02 else "FAIL"
    if error >= 0.02:
        all_pass = False
    print(f"Input: {inp} -> Gamma: {np.round(after_gamma, 4)} -> Inverted: {np.round(after_inv, 4)} | Error: {error:.6f} [{status}]")

print()
if all_pass:
    print("ALL TESTS PASSED!")
else:
    print("SOME TESTS FAILED!")
