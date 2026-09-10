# Joke Question Video Generator

A command-line media pipeline that turns a two-part joke into a portrait video.
It combines JokeAPI content, Pexels stock footage, Edge text-to-speech, and an
FFmpeg filter graph for timing, cropping, audio, and burned-in captions.

## Pipeline

1. Fetch a question-and-answer joke.
2. Extract useful search terms from each half.
3. Download portrait stock clips from Pexels.
4. Generate narration with a randomly selected English voice.
5. Fit clips to the narration duration and render a 720 × 1280 MP4.
6. Remove temporary downloads after a successful render.

## Requirements

- Node.js 18+
- Python 3.10+
- FFmpeg available on `PATH`
- a Pexels API key

## Setup

```sh
npm ci
python -m venv .venv
python -m pip install -r requirements.txt
cp .env.example .env
```

Add your own `PEXELS_API_KEY` to `.env`, then run:

```sh
npm start
```

The generated file is `dynamic_video.mp4`. Media outputs and credentials are
excluded from version control.

## Configuration

- `PYTHON_COMMAND` overrides the Python executable (`py` on Windows,
  `python3` elsewhere).
- `FFMPEG_FONT_FILE` selects the font used for captions.

## Responsible use

Check the current licences and attribution requirements of JokeAPI, Pexels,
and the speech service before publishing generated media. This repository does
not upload videos or automate social-media accounts.

## Verification

```sh
npm run check
python -m py_compile generate_tts.py
```
