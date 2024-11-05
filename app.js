const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');

async function generateSpeech(text, outputPath) {
  const apiKey = 'YOUR_ISPEECH_API_KEY';
  const url = 'https://api.ispeech.org/api/rest';
  const params = {
    apikey: apiKey,
    action: 'convert',
    text: text,
    voice: 'usenglishfemale',
    format: 'mp3',
  };

  try {
    const response = await axios.get(url, { params, responseType: 'arraybuffer' });
    await fs.writeFile(outputPath, response.data);
    console.log(`Audio saved to ${outputPath}`);
  } catch (error) {
    console.error('Error generating speech:', error);
  }
}

async function fetchVideoClips(query, count = 3) {
  const apiKey = 'REVOKED_PEXELS_API_KEY';
  const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=${count}`;

  try {
    const response = await axios.get(url, {
      headers: { Authorization: apiKey },
    });
    return response.data.videos.map(video => video.video_files[0].link);
  } catch (error) {
    console.error('Error fetching video clips:', error);
    return [];
  }
}

async function createVideoWithAudioAndSubtitles(videoUrls, audioPaths, subtitles, outputPath) {
  try {
    const videoPaths = await Promise.all(videoUrls.map(async (url, index) => {
      const videoPath = path.join(__dirname, `video${index}.mp4`);
      const response = await axios.get(url, { responseType: 'stream' });
      const writer = fs.createWriteStream(videoPath);
      response.data.pipe(writer);
      return new Promise((resolve, reject) => {
        writer.on('finish', () => resolve(videoPath));
        writer.on('error', reject);
      });
    }));

    const command = ffmpeg();

    // Add video clips
    videoPaths.forEach((videoPath) => {
      command.input(videoPath);
    });

    // Add audio clips for question and answer
    audioPaths.forEach((audioPath) => {
      command.input(audioPath);
    });

    // Add filters for subtitles if needed
    subtitles.forEach((subtitle, index) => {
      command.complexFilter([
        {
          filter: 'subtitles',
          options: subtitle,
        },
      ]);
    });

    command
      .on('error', (err) => console.error('Error:', err))
      .on('end', () => console.log('Processing finished successfully'))
      .mergeToFile(outputPath, path.join(__dirname, 'tempdir'));
  } catch (error) {
    console.error('Error creating video:', error);
  }
}

async function main() {
  const question = "How do you make a delicious smoothie?";
  const answer = "By not putting 22 gallons of gasoline in it.";

  // Step 1: Generate speech for question and answer
  const questionAudioPath = path.join(__dirname, 'question.mp3');
  const answerAudioPath = path.join(__dirname, 'answer.mp3');
  await generateSpeech(question, questionAudioPath);
  await generateSpeech(answer, answerAudioPath);

  // Step 2: Fetch video clips
  const videoUrls = await fetchVideoClips('smoothie', 2);

  // Step 3: Prepare subtitles (you may need to adjust timings)
  const subtitles = [
    { text: question, start: 0, duration: 5 },
    { text: answer, start: 5, duration: 5 },
  ];

  // Step 4: Create the final video with audio and subtitles
  const outputPath = path.join(__dirname, 'funny_video.mp4');
  await createVideoWithAudioAndSubtitles(videoUrls, [questionAudioPath, answerAudioPath], subtitles, outputPath);

  console.log('Funny video created successfully at', outputPath);
}

// Run the main function
main();
