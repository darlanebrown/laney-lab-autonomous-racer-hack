"""
Data augmentation for behavioral cloning training.

Augmentations are applied on-the-fly during training to effectively multiply
the dataset without storing extra images on disk.  Every augmentation that
alters the horizontal perspective also adjusts the steering label so the
model learns the correct correction.

Supported augmentations (all probabilities are configurable):
  - Horizontal flip (mirrors image and negates steering)
  - Brightness jitter
  - Contrast jitter
  - Gaussian noise
  - Shadow overlay (simulates lighting changes)
  - Horizontal translation (shift image left/right, adjust steering)
"""
from __future__ import annotations

import random

import numpy as np


# ---------------------------------------------------------------------------
# Individual augmentation functions
# ---------------------------------------------------------------------------
# All operate on CHW float32 arrays in [0, 1] and return (image, steering).

def flip_horizontal(img: np.ndarray, steering: float) -> tuple[np.ndarray, float]:
    """Mirror the image left-right and negate steering."""
    return img[:, :, ::-1].copy(), -steering


def adjust_brightness(img: np.ndarray, steering: float,
                      low: float = 0.6, high: float = 1.4) -> tuple[np.ndarray, float]:
    """Scale pixel values by a random factor."""
    factor = random.uniform(low, high)
    return np.clip(img * factor, 0.0, 1.0).astype(np.float32), steering


def adjust_contrast(img: np.ndarray, steering: float,
                    low: float = 0.6, high: float = 1.4) -> tuple[np.ndarray, float]:
    """Adjust contrast around the mean."""
    factor = random.uniform(low, high)
    mean = img.mean(axis=(1, 2), keepdims=True)
    return np.clip(mean + factor * (img - mean), 0.0, 1.0).astype(np.float32), steering


def add_gaussian_noise(img: np.ndarray, steering: float,
                       sigma: float = 0.03) -> tuple[np.ndarray, float]:
    """Add random Gaussian noise."""
    noise = np.random.normal(0, sigma, img.shape).astype(np.float32)
    return np.clip(img + noise, 0.0, 1.0).astype(np.float32), steering


def add_random_shadow(img: np.ndarray, steering: float,
                      shadow_strength: float = 0.5) -> tuple[np.ndarray, float]:
    """Overlay a vertical shadow band to simulate lighting variation."""
    _, h, w = img.shape
    x1 = random.randint(0, w)
    x2 = random.randint(0, w)
    left, right = min(x1, x2), max(x1, x2)
    if right - left < 10:
        return img, steering

    shadow = img.copy()
    shadow[:, :, left:right] *= shadow_strength
    return np.clip(shadow, 0.0, 1.0).astype(np.float32), steering


def translate_horizontal(img: np.ndarray, steering: float,
                         max_shift_px: int = 20,
                         steering_per_px: float = 0.004) -> tuple[np.ndarray, float]:
    """
    Shift the image left or right and adjust steering proportionally.

    This simulates the car being off-center -- the most important augmentation
    for behavioral cloning because it teaches recovery behavior that pure
    center-line driving data cannot provide.
    """
    shift = random.randint(-max_shift_px, max_shift_px)
    if shift == 0:
        return img, steering

    _, h, w = img.shape
    shifted = np.zeros_like(img)
    if shift > 0:
        shifted[:, :, shift:] = img[:, :, :w - shift]
    else:
        shifted[:, :, :w + shift] = img[:, :, -shift:]

    adjusted_steering = steering + shift * steering_per_px
    adjusted_steering = max(-1.0, min(1.0, adjusted_steering))
    return shifted, adjusted_steering


# ---------------------------------------------------------------------------
# Augmentation pipeline
# ---------------------------------------------------------------------------

class AugmentationPipeline:
    """
    Configurable augmentation pipeline for driving images.

    Usage:
        aug = AugmentationPipeline()
        augmented_img, augmented_steering = aug(img_chw, steering)
    """

    def __init__(
        self,
        flip_prob: float = 0.5,
        brightness_prob: float = 0.4,
        contrast_prob: float = 0.3,
        noise_prob: float = 0.2,
        shadow_prob: float = 0.3,
        translate_prob: float = 0.4,
        translate_max_px: int = 20,
        translate_steering_per_px: float = 0.004,
    ):
        self.flip_prob = flip_prob
        self.brightness_prob = brightness_prob
        self.contrast_prob = contrast_prob
        self.noise_prob = noise_prob
        self.shadow_prob = shadow_prob
        self.translate_prob = translate_prob
        self.translate_max_px = translate_max_px
        self.translate_steering_per_px = translate_steering_per_px

    def __call__(self, img: np.ndarray, steering: float) -> tuple[np.ndarray, float]:
        """Apply random augmentations to image and steering."""
        if random.random() < self.translate_prob:
            img, steering = translate_horizontal(
                img, steering,
                max_shift_px=self.translate_max_px,
                steering_per_px=self.translate_steering_per_px,
            )

        if random.random() < self.flip_prob:
            img, steering = flip_horizontal(img, steering)

        if random.random() < self.brightness_prob:
            img, steering = adjust_brightness(img, steering)

        if random.random() < self.contrast_prob:
            img, steering = adjust_contrast(img, steering)

        if random.random() < self.shadow_prob:
            img, steering = add_random_shadow(img, steering)

        if random.random() < self.noise_prob:
            img, steering = add_gaussian_noise(img, steering)

        return img, steering
