import sys
import asyncio
import edge_tts
import random

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

async def generate_tts(text, output_path):
    selected_voice = random.choice(voices)  # Pick a random voice from the list
    communicate = edge_tts.Communicate(text, voice=selected_voice)
    await communicate.save(output_path)
    print(f"Audio saved to {output_path} using voice {selected_voice}")

if __name__ == "__main__":
    # Get text and output path from command-line arguments
    text = sys.argv[1]
    output_path = sys.argv[2]
    asyncio.run(generate_tts(text, output_path))
