const { exec } = require('child_process');
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');

async function generateSpeechWithPython(text, outputPath) {
	return new Promise((resolve, reject) => {
		// Run the Python script with `text` and `outputPath` as arguments
		const command = `py generate_tts.py "${text}" "${outputPath}"`;
		exec(command, (error, stdout, stderr) => {
			if (error) {
				console.error('Error generating speech with Python:', stderr);
				reject(error);
			} else {
				console.log(stdout);
				resolve();
			}
		});
	});
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
		const tempDir = path.join(__dirname, 'tempdir');
		await fs.ensureDir(tempDir);
		await fs.ensureDir(path.dirname(outputPath));
		await fs.remove(outputPath);

		// Download video files
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

		// Add inputs
		for (let i = 0; i < videoPaths.length; i++) {
			command.input(videoPaths[i]);      // Video input
			command.input(audioPaths[i]);      // Corresponding audio input
		}

		// Escape subtitle text
		function escapeSubtitleText(text) {
			return text
				.replace(/\\/g, '\\\\')   // Escape backslashes
				.replace(/'/g, "\\'")     // Escape single quotes
				.replace(/:/g, '\\:')     // Escape colons
				.replace(/,/g, '\\,')     // Escape commas
				.replace(/=/g, '\\=')     // Escape equals signs
				.replace(/"/g, '\\"');    // Escape double quotes
		}

		// Prepare filter complex components
		let filterComplexParts = [];
		let videoLabels = [];
		let audioLabels = [];

		// Pair each video and audio input and label them
		for (let i = 0; i < videoPaths.length; i++) {
			const videoInput = i * 2;
			const audioInput = i * 2 + 1;

			filterComplexParts.push(`[${videoInput}:v][${audioInput}:a] concat=n=1:v=1:a=1 [v${i}][a${i}]`);
			videoLabels.push(`[v${i}]`);
			audioLabels.push(`[a${i}]`);
		}

		// Concatenate all videos and audios
		filterComplexParts.push(`${videoLabels.join('')}concat=n=${videoPaths.length}:v=1:a=0 [v]`);
		filterComplexParts.push(`${audioLabels.join('')}concat=n=${audioPaths.length}:v=0:a=1 [a]`);

		// Add subtitles
		const fontPath = 'C:/Windows/Fonts/Arial.ttf'; // Replace with a valid font path
		filterComplexParts.push(`[v]copy[v0]`); // Copy the video stream to [v0] for applying subtitles

		subtitles.forEach((subtitle, index) => {
			filterComplexParts.push(
				`[v${index}]drawtext=fontfile='${fontPath}':text='${escapeSubtitleText(subtitle.text)}':fontsize=24:fontcolor=white:x=(w-text_w)/2:y=(h-text_h-line_h):enable='between(t,${subtitle.start},${subtitle.start + subtitle.duration})'[v${index + 1}]`
			);
		});

		const finalVideoLabel = `[v${subtitles.length}]`;
		const filterComplex = filterComplexParts.join('; ');

		// Build the command
		command
			.complexFilter(filterComplex, [finalVideoLabel.replace('[', '').replace(']', ''), 'a'])
			.outputOptions('-map', finalVideoLabel, '-map', '[a]')
			.videoCodec('libx264')
			.audioCodec('aac')
			.format('mp4')
			.outputOptions('-y')
			.output(`"${outputPath.replace(/\\/g, '/')}"`)
			.on('start', (cmdLine) => console.log('Spawned FFmpeg with command:', cmdLine))
			.on('error', (err, stdout, stderr) => {
				console.error('Error:', err);
				console.error('FFmpeg stderr:', stderr);
			})
			.on('end', () => console.log('Processing finished successfully'))
			.run();
	} catch (error) {
		console.error('Error creating video:', error);
	}
}



async function main() {
	const question = "How do you make your bed?";
	const answer = "By not putting 22 gallons of gasoline on it.";

	// Step 1: Generate speech for question and answer using Python script
	const questionAudioPath = path.join(__dirname, 'question.mp3');
	const answerAudioPath = path.join(__dirname, 'answer.mp3');
	await generateSpeechWithPython(question, questionAudioPath);
	await generateSpeechWithPython(answer, answerAudioPath);

	// Step 2: Fetch video clips
	const videoUrls = await fetchVideoClips('bed', 2);

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
