from __future__ import annotations

import shutil
import subprocess
import tempfile
import os
from pathlib import Path
from typing import Optional, Sequence


def _ensure_ffmpeg() -> str:
	ffmpeg_path = os.getenv("FFMPEG_PATH") or shutil.which("ffmpeg")
	if not ffmpeg_path:
		raise RuntimeError("ffmpeg is not available on PATH and FFMPEG_PATH is not set")
	return ffmpeg_path


def _run(command: Sequence[str]) -> None:
	subprocess.run(command, check=True)


def _scale_filter(width: Optional[int], height: Optional[int], fps: Optional[int]) -> str:
	filters = []
	if width and height:
		filters.append(f"scale={width}:{height}")
	if fps:
		filters.append(f"fps={fps}")
	return ",".join(filters)


def make_image_clip(
	image_path: Path,
	output_path: Path,
	*,
	duration_s: float,
	width: Optional[int] = 1080,
	height: Optional[int] = 1920,
	fps: Optional[int] = 30,
) -> None:
	ffmpeg = _ensure_ffmpeg()
	filter_arg = _scale_filter(width, height, fps)

	command = [
		ffmpeg,
		"-y",
		"-loop",
		"1",
		"-t",
		str(duration_s),
		"-i",
		str(image_path),
	]
	if filter_arg:
		command += ["-vf", filter_arg]
	command += [
		"-c:v",
		"libx264",
		"-pix_fmt",
		"yuv420p",
		str(output_path),
	]

	_run(command)


def concat_videos(
	video_paths: Sequence[Path],
	output_path: Path,
	*,
	audio_path: Optional[Path] = None,
	reencode: bool = True,
	width: Optional[int] = 1080,
	height: Optional[int] = 1920,
	fps: Optional[int] = 30,
) -> None:
	if not video_paths:
		raise ValueError("video_paths cannot be empty")

	ffmpeg = _ensure_ffmpeg()
	with tempfile.TemporaryDirectory() as temp_dir:
		list_path = Path(temp_dir) / "concat_list.txt"
		lines = [f"file '{path.as_posix()}'" for path in video_paths]
		list_path.write_text("\n".join(lines) + "\n")

		command = [
			ffmpeg,
			"-y",
			"-f",
			"concat",
			"-safe",
			"0",
			"-i",
			str(list_path),
		]

		if audio_path:
			command += ["-i", str(audio_path)]

		if reencode:
			filter_arg = _scale_filter(width, height, fps)
			if filter_arg:
				command += ["-vf", filter_arg]
			command += ["-c:v", "libx264", "-pix_fmt", "yuv420p"]
			if audio_path:
				command += ["-c:a", "aac", "-shortest"]
		else:
			command += ["-c", "copy"]

		command.append(str(output_path))
		_run(command)


def build_video_from_images(
	image_paths: Sequence[Path],
	durations_s: Sequence[float],
	output_path: Path,
	*,
	audio_path: Optional[Path] = None,
	width: Optional[int] = 1080,
	height: Optional[int] = 1920,
	fps: Optional[int] = 30,
) -> None:
	if not image_paths:
		raise ValueError("image_paths cannot be empty")
	if len(image_paths) != len(durations_s):
		raise ValueError("image_paths and durations_s must have the same length")

	with tempfile.TemporaryDirectory() as temp_dir:
		temp_dir_path = Path(temp_dir)
		clips: list[Path] = []
		for index, (image_path, duration_s) in enumerate(zip(image_paths, durations_s)):
			clip_path = temp_dir_path / f"clip_{index:03d}.mp4"
			make_image_clip(
				image_path,
				clip_path,
				duration_s=duration_s,
				width=width,
				height=height,
				fps=fps,
			)
			clips.append(clip_path)

		concat_videos(
			clips,
			output_path,
			audio_path=audio_path,
			reencode=True,
			width=width,
			height=height,
			fps=fps,
		)
