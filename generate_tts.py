import asyncio
import random
import sys

import edge_tts

voices = [
    'en-US-AmberNeural',
    'en-US-AnaNeural',
    'en-US-AriaNeural',
    'en-US-ChristopherNeural',
    'en-US-GuyNeural',
    'en-US-JennyNeural',
    'en-US-MichelleNeural',
    'en-GB-LibbyNeural',
    'en-GB-RyanNeural',
    'en-GB-SoniaNeural'
]

async def generate_tts(text, output_path, max_retries=3):
    selected_voice = random.choice(voices)
    retries = 0
    while retries < max_retries:
        try:
            communicate = edge_tts.Communicate(text, voice=selected_voice)
            await communicate.save(output_path)
            print(f"Audio saved to {output_path} using voice {selected_voice}")
            return
        except edge_tts.exceptions.NoAudioReceived:
            retries += 1
            print(f"No audio received for text: {text}. Retrying {retries}/{max_retries}...")
            await asyncio.sleep(1)  # Wait before retrying
        except Exception as e:
            print(f"An unexpected error occurred: {e}")
            break
    print(f"Failed to generate audio after {max_retries} attempts.")

if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Usage: python generate_tts.py <text> <output-path>")
    text = sys.argv[1]
    output_path = sys.argv[2]
    asyncio.run(generate_tts(text, output_path))
