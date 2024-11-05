import sys
import asyncio
import edge_tts

async def generate_tts(text, output_path):
    communicate = edge_tts.Communicate(text, voice="en-IN-PrabhatNeural")  # You can change the voice if you want
    await communicate.save(output_path)
    print(f"Audio saved to {output_path}")

if __name__ == "__main__":
    # Get text and output path from command-line arguments
    text = sys.argv[1]
    output_path = sys.argv[2]
    asyncio.run(generate_tts(text, output_path))
