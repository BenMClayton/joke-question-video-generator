const { exec } = require('child_process');
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');

async function generateSpeechWithPython(text, outputPath) {
	return new Promise((resolve, reject) => {
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

async function fetchVideoClips(query, count) {
	const apiKey = 'REVOKED_PEXELS_API_KEY'; // Replace with your actual Pexels API key
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

async function downloadVideos(videoUrls) {
	return Promise.all(videoUrls.map(async (url, index) => {
		const videoPath = path.join(__dirname, `video${index}.mp4`);
		const response = await axios.get(url, { responseType: 'stream' });
		const writer = fs.createWriteStream(videoPath);
		response.data.pipe(writer);
		return new Promise((resolve, reject) => {
			writer.on('finish', () => resolve(videoPath));
			writer.on('error', reject);
		});
	}));
}

function escapeFFmpegPath(filePath) {
	return filePath
		.replace(/\\/g, '/')   // Replace backslashes with forward slashes
		.replace(/:/g, '\\:'); // Escape colons
}

function escapeSubtitleText(text) {
	return text
		.replace(/\\/g, '\\\\')
		.replace(/'/g, "\\'")
		.replace(/:/g, '\\:')
		.replace(/,/g, '\\,')
		.replace(/=/g, '\\=')
		.replace(/"/g, '\\"');
}

async function createVideoWithAudioAndSubtitles(questionVideoPaths, answerVideoPaths, audioPaths, subtitles, outputPath) {
	try {
		const command = ffmpeg();

		const allVideoPaths = [...questionVideoPaths, ...answerVideoPaths];
		const totalVideos = allVideoPaths.length;

		// Add video inputs
		allVideoPaths.forEach(videoPath => command.input(videoPath));
		// Add audio inputs
		audioPaths.forEach(audioPath => command.input(audioPath));

		let filterComplexParts = [];
		let scaledVideoLabels = [];
		let audioInputs = [];

		const targetWidth = 1280;
		const targetHeight = 720;

		// Apply scaling to each video input
		for (let i = 0; i < totalVideos; i++) {
			const inputLabel = `[${i}:v]`;
			const scaledLabel = `[v_scaled${i}]`;

			// Add scale filter
			filterComplexParts.push(
				`${inputLabel}scale=${targetWidth}:${targetHeight},setsar=1${scaledLabel}`
			);

			scaledVideoLabels.push(scaledLabel);
		}

		// Create labels for audio streams
		for (let i = 0; i < audioPaths.length; i++) {
			const audioIndex = totalVideos + i;
			audioInputs.push(`[${audioIndex}:a]`);
		}

		// Concatenate scaled video clips
		filterComplexParts.push(`${scaledVideoLabels.join('')}concat=n=${totalVideos}:v=1:a=0 [v_concat]`);
		// Concatenate audio files
		filterComplexParts.push(`${audioInputs.join('')}concat=n=${audioInputs.length}:v=0:a=1 [a_concat]`);

		// Escape font path
		const fontPath = escapeFFmpegPath('C:/Windows/Fonts/Arial.ttf'); // Adjust the font path as needed

		// Add subtitles
		let lastVideoLabel = '[v_concat]';
		subtitles.forEach((subtitle, index) => {
			const nextVideoLabel = `[v_sub${index}]`;
			filterComplexParts.push(
				`${lastVideoLabel}drawtext=fontfile='${fontPath}':text='${escapeSubtitleText(subtitle.text)}':fontsize=24:fontcolor=white:x=(w-text_w)/2:y=(h-text_h-line_h):enable='between(t\\,${subtitle.start.toFixed(3)}\\,${(subtitle.start + subtitle.duration).toFixed(3)})'${nextVideoLabel}`
			);
			lastVideoLabel = nextVideoLabel;
		});

		// The final video label after all subtitles have been applied
		const finalVideoLabel = lastVideoLabel;
		const finalAudioLabel = '[a_concat]';

		const filterComplex = filterComplexParts.join('; ');

		// Build the FFmpeg command
		command
			.complexFilter(filterComplex)
			.outputOptions('-map', finalVideoLabel, '-map', finalAudioLabel)
			.videoCodec('libx264')
			.audioCodec('aac')
			.format('mp4')
			.outputOptions('-y')
			.output(outputPath)
			.on('start', cmdLine => console.log('Spawned FFmpeg with command:', cmdLine))
			.on('stderr', stderrLine => console.log('FFmpeg stderr:', stderrLine))
			.on('error', (err, stdout, stderr) => console.error('Error:', err.message))
			.on('end', () => console.log('Processing finished successfully'))
			.run();
	} catch (error) {
		console.error('Error creating video:', error.message);
	}
}


async function main() {
	const question = "How do you make your bed?";
	const answer = "By not putting 22 gallons of gasoline on it.";

	const questionAudioPath = path.join(__dirname, 'question.mp3');
	const answerAudioPath = path.join(__dirname, 'answer.mp3');

	// Generate speech for question and answer
	await generateSpeechWithPython(question, questionAudioPath);
	await generateSpeechWithPython(answer, answerAudioPath);

	// Get durations of the audio files (assuming you have a way to get this info)
	const getAudioDuration = async (audioPath) => {
		return new Promise((resolve, reject) => {
			ffmpeg.ffprobe(audioPath, (err, metadata) => {
				if (err) return reject(err);
				resolve(metadata.format.duration);
			});
		});
	};

	const questionAudioDuration = await getAudioDuration(questionAudioPath);
	const answerAudioDuration = await getAudioDuration(answerAudioPath);

	// Fetch videos based on question and answer
	const questionVideoUrls = await fetchVideoClips(question, 2); // Fetch 2 videos for question
	const answerVideoUrls = await fetchVideoClips(answer, 2);     // Fetch 2 videos for answer

	const questionVideoPaths = await downloadVideos(questionVideoUrls);
	const answerVideoPaths = await downloadVideos(answerVideoUrls);

	// Prepare subtitles with accurate timing
	const subtitles = [
		{ text: question, start: 0, duration: questionAudioDuration },
		{ text: answer, start: questionAudioDuration, duration: answerAudioDuration },
	];

	// Output path for the final video
	const outputPath = path.join(__dirname, 'dynamic_video.mp4');

	// Create the video with audio and subtitles
	await createVideoWithAudioAndSubtitles(
		questionVideoPaths,
		answerVideoPaths,
		[questionAudioPath, answerAudioPath],
		subtitles,
		outputPath
	);

	console.log('Dynamic video created successfully at', outputPath);
}

// Run the main function
main();
