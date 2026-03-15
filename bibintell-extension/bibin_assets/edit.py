from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


def split_image_into_four(image_path: str) -> list[Path]:
	"""Split a square image into 4 parts along its midlines and save each part."""
	source_path = Path(image_path).expanduser().resolve()

	if not source_path.exists() or not source_path.is_file():
		raise FileNotFoundError(f"Image file not found: {source_path}")

	with Image.open(source_path) as image:
		width, height = image.size
		if width != height:
			raise ValueError(
				f"Image must be square. Got width={width}, height={height}."
			)

		mid_x = width // 2
		mid_y = height // 2

		quadrants = {
			"top_left": (0, 0, mid_x, mid_y),
			"top_right": (mid_x, 0, width, mid_y),
			"bottom_left": (0, mid_y, mid_x, height),
			"bottom_right": (mid_x, mid_y, width, height),
		}

		saved_paths: list[Path] = []
		for name, box in quadrants.items():
			part = image.crop(box)
			output_path = source_path.with_name(
				f"{source_path.stem}_{name}{source_path.suffix}"
			)
			part.save(output_path)
			saved_paths.append(output_path)

	return saved_paths


def main() -> None:
	parser = argparse.ArgumentParser(
		description="Split a square image into 4 subimages using midlines."
	)
	parser.add_argument("image_path", help="Path to the square image file")
	args = parser.parse_args()

	output_files = split_image_into_four(args.image_path)
	for output_file in output_files:
		print(output_file)


if __name__ == "__main__":
	main()
