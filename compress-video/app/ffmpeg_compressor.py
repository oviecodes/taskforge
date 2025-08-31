import ffmpeg

from app.utils.logger import log
from app.utils.metrics import ffmpeg_failures_total

logger = log("compress-video")

def compress_video(input_path: str, output_path: str, options: dict = {}):
    """
    Compress a video using ffmpeg.
    
    Supported options:
    - format: 'mp4', 'webm' (default: mp4)
    - bitrate: e.g., '1000k' (default)
    - preset: 'fast', 'slow', etc. (default: 'fast')
    """

    format = options.get("format", "mp4")
    bitrate = options.get("bitrate", "1000k")
    preset = options.get("preset", "fast")

    # Determine codecs based on format
    if format == "webm":
        vcodec = "libvpx"
        acodec = "libvorbis"
    else:
        vcodec = "libx264"
        acodec = "aac"

    try:
        logger.info(f"🎬 Compressing with: vcodec={vcodec}, acodec={acodec}, bitrate={bitrate}, preset={preset}")

        (
            ffmpeg
            .input(input_path)
            .output(
                output_path,
                vf='scale=-2:720',
                vcodec=vcodec,
                acodec=acodec,
                video_bitrate=bitrate,
                audio_bitrate='128k',
                preset=preset,
                movflags='+faststart',
                map_metadata=-1  # Strip metadata
            )
            .overwrite_output()
            .run(quiet=False)
        )

        logger.info(f"✅ FFmpeg compression finished → {output_path}")

    except ffmpeg.Error as e:
        ffmpeg_failures_total.labels(codec=vcodec, format=format).inc()
        logger.error("❌ FFmpeg compression failed")
        logger.error(e.stderr.decode() if e.stderr else str(e))
        raise RuntimeError("Compression failed") from e
