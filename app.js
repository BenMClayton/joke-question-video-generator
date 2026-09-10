require('dotenv').config();

const { spawn } = require('child_process');
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');

async function generateSpeechWithPython(text, outputPath) {
	return new Promise((resolve, reject) => {
		const python = process.env.PYTHON_COMMAND || (process.platform === 'win32' ? 'py' : 'python3');
		const child = spawn(python, ['generate_tts.py', text, outputPath], {
			cwd: __dirname,
			stdio: 'inherit',
		});
		child.once('error', reject);
		child.once('exit', code => {
			if (code === 0) resolve();
			else reject(new Error(`Text-to-speech process exited with code ${code}`));
		});
	});
}

function extractKeywords(text) {
	const stopWords = ['how', 'do', 'you', 'your', 'the', 'is', 'a', 'an', 'and', 'or', 'it', 'by', 'on', 'of', 'to', 'in', 'with', 'for'];
	return text
		.toLowerCase()
		.replace(/[^\w\s]/g, '') // Remove punctuation
		.split(' ')
		.filter(word => !stopWords.includes(word))
		.join(' ');
}

async function fetchVideoClips(query, count) {
	const apiKey = process.env.PEXELS_API_KEY;
	if (!apiKey) {
		throw new Error('PEXELS_API_KEY is required. Copy .env.example to .env and add your key.');
	}
	const keywords = extractKeywords(query);
	const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(keywords)}&per_page=${count}&orientation=portrait`;

	try {
		console.log(`Fetching videos with keywords: "${keywords}"`);
		const response = await axios.get(url, {
			headers: { Authorization: apiKey },
		});
		const videoUrls = response.data.videos.map(video => video.video_files[0].link);
		console.log(`Fetched ${videoUrls.length} video URLs:`, videoUrls);
		return videoUrls;
	} catch (error) {
		if (error.response) {
			console.error('API Error:', error.response.data);
		} else {
			console.error('Error fetching video clips:', error.message);
		}
		return [];
	}
}

async function downloadVideos(videoUrls, prefix) {
	return Promise.all(videoUrls.map(async (url, index) => {
		try {
			const videoPath = path.join(__dirname, `${prefix}_video${index}.mp4`);
			console.log(`Downloading video to ${videoPath} from URL: ${url}`);
			const response = await axios.get(url, { responseType: 'stream' });
			const writer = fs.createWriteStream(videoPath);
			response.data.pipe(writer);
			return new Promise((resolve, reject) => {
				writer.on('finish', () => {
					console.log(`Successfully downloaded ${videoPath}`);
					resolve(videoPath);
				});
				writer.on('error', (err) => {
					console.error(`Error writing file ${videoPath}:`, err);
					reject(err);
				});
			});
		} catch (error) {
			console.error(`Error downloading video from ${url}:`, error.message);
			return null; // Return null to indicate a failed download
		}
	}));
}

function escapeFFmpegPath(filePath) {
	return filePath
		.replace(/\\/g, '/')
		.replace(/:/g, '\\:'); // Single backslash to escape colon
}

function escapeSubtitleText(text) {
	return text
		.replace(/'/g, "''")        // Escape single quotes by doubling them
		.replace(/\\/g, '\\\\')     // Escape backslashes
		.replace(/\n/g, '\\n')      // Replace newlines with \n
		.replace(/[:;,]/g, '\\$&'); // Escape colons, semicolons, commas
}

function wrapText(text, maxCharsPerLine) {
	const words = text.split(' ');
	let lines = [];
	let currentLine = '';

	words.forEach((word, index) => {
		const testLine = currentLine.length > 0 ? `${currentLine} ${word}` : word;

		if (testLine.length <= maxCharsPerLine) {
			currentLine = testLine;
		} else {
			if (currentLine.length > 0) lines.push(currentLine);
			currentLine = word;
		}

		// Handle last word
		if (index === words.length - 1 && currentLine.length > 0) {
			lines.push(currentLine);
		}
	});

	return lines.join('\n');
}

async function fetchRandomJoke() {
	try {
		const url = `https://v2.jokeapi.dev/joke/Any?type=twopart`;

		console.log('Fetching joke with URL:', url);

		// Fetch the joke from JokeAPI
		const response = await axios.get(url);
		const joke = response.data;

		// Return the joke in a structured format
		return {
			question: joke.setup,
			answer: joke.delivery,
		};
	} catch (error) {
		console.error('Error fetching joke:', error.message);
		// Fallback joke in case API fails
		return {
			question: "Why did the scarecrow win an award?",
			answer: "Because he was outstanding in his field!",
		};
	}
}

async function createVideoWithAudioAndSubtitles(questionVideoPaths, answerVideoPaths, audioPaths, subtitles, outputPath, audioDurations) {
	return new Promise((resolve, reject) => {
		try {
			const command = ffmpeg();

			const allVideoPaths = [...questionVideoPaths, ...answerVideoPaths];
			const totalVideos = allVideoPaths.length;

			for (const videoPath of allVideoPaths) {
				if (!fs.existsSync(videoPath)) {
					throw new Error(`Video file not found: ${videoPath}`);
				}
			}

			allVideoPaths.forEach(videoPath => command.input(videoPath));
			audioPaths.forEach(audioPath => command.input(audioPath));

			let filterComplexParts = [];
			let scaledVideoLabels = [];
			let audioInputs = [];

			const targetWidth = 720;
			const targetHeight = 1280;

			const questionVideoDuration = audioDurations.questionAudioDuration / questionVideoPaths.length;
			const answerVideoDuration = audioDurations.answerAudioDuration / answerVideoPaths.length;

			for (let i = 0; i < totalVideos; i++) {
				const inputLabel = `[${i}:v]`;
				const scaledLabel = `[v_scaled${i}]`;

				let duration = i < questionVideoPaths.length ? questionVideoDuration : answerVideoDuration;

				filterComplexParts.push(
					`${inputLabel}trim=duration=${duration.toFixed(3)},setpts=PTS-STARTPTS,` +
					`scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,` +
					`pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2,setsar=1${scaledLabel}`
				);

				scaledVideoLabels.push(scaledLabel);
			}

			for (let i = 0; i < audioPaths.length; i++) {
				const audioIndex = totalVideos + i;
				audioInputs.push(`[${audioIndex}:a]`);
			}

			filterComplexParts.push(`${scaledVideoLabels.join('')}concat=n=${totalVideos}:v=1:a=0 [v_concat]`);
			filterComplexParts.push(`${audioInputs.join('')}concat=n=${audioInputs.length}:v=0:a=1 [a_concat]`);

			const defaultFont = process.platform === 'win32'
				? 'C:/Windows/Fonts/Arial.ttf'
				: '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
			const fontPath = escapeFFmpegPath(process.env.FFMPEG_FONT_FILE || defaultFont);

			let lastVideoLabel = '[v_concat]';
			subtitles.forEach((subtitle, index) => {
				const nextVideoLabel = `[v_sub${index}]`;
				filterComplexParts.push(
					`${lastVideoLabel}drawtext=` +
					`fontfile='${fontPath}':` +
					`text='${escapeSubtitleText(subtitle.text)}':` +
					`fontsize=${subtitle.fontsize}:` +
					`fontcolor=white:` +
					`borderw=2:` +
					`bordercolor=black:` +
					`shadowcolor=black:` +
					`shadowx=2:` +
					`shadowy=2:` +
					`x=(w - text_w)/2:` +
					`y=${targetHeight - 200 - (subtitle.fontsize * subtitle.lines.length)}:` +
					`line_spacing=5:` +
					`enable='between(t,${subtitle.start.toFixed(3)},${(subtitle.start + subtitle.duration).toFixed(3)})'` +
					`${nextVideoLabel}`
				);
				lastVideoLabel = nextVideoLabel;
			});

			const finalVideoLabel = lastVideoLabel;
			const finalAudioLabel = '[a_concat]';

			const filterComplex = filterComplexParts.join('; ');

			command
				.complexFilter(filterComplex)
				.outputOptions('-map', finalVideoLabel, '-map', finalAudioLabel)
				.videoCodec('libx264')
				.audioCodec('aac')
				.format('mp4')
				.outputOptions('-pix_fmt', 'yuv420p')
				.outputOptions('-shortest')
				.outputOptions('-y')
				.output(outputPath)
				.on('start', cmdLine => console.log('Spawned FFmpeg with command:', cmdLine))
				.on('stderr', stderrLine => console.log('FFmpeg stderr:', stderrLine))
				.on('error', (err, stdout, stderr) => {
					console.error('Error:', err.message);
					reject(err);
				})
				.on('end', () => {
					console.log('Processing finished successfully');
					resolve();
				})
				.run();
		} catch (error) {
			console.error('Error creating video:', error.message);
			reject(error);
		}
	});
}

async function main() {
	try {
		const { question, answer } = await fetchRandomJoke();

		const questionAudioPath = path.join(__dirname, 'question.mp3');
		const answerAudioPath = path.join(__dirname, 'answer.mp3');

		await generateSpeechWithPython(question, questionAudioPath);
		await generateSpeechWithPython(answer, answerAudioPath);

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

		const questionVideoUrls = await fetchVideoClips(question, 2);
		const answerVideoUrls = await fetchVideoClips(answer, 2);

		if (questionVideoUrls.length === 0 || answerVideoUrls.length === 0) {
			console.error('No videos found. Check query or API key.');
			return;
		}

		const questionVideoPaths = (await downloadVideos(questionVideoUrls, 'question')).filter(Boolean);
		const answerVideoPaths = (await downloadVideos(answerVideoUrls, 'answer')).filter(Boolean);

		const fontSize = 32;
		const maxCharsPerLine = 30;

		const subtitles = [
			{ text: wrapText(question, maxCharsPerLine), start: 0, duration: questionAudioDuration, fontsize: fontSize, lines: [] },
			{ text: wrapText(answer, maxCharsPerLine), start: questionAudioDuration, duration: answerAudioDuration, fontsize: fontSize, lines: [] },
		];

		subtitles.forEach(subtitle => subtitle.lines = subtitle.text.split('\n'));

		const outputPath = path.join(__dirname, 'dynamic_video.mp4');

		await createVideoWithAudioAndSubtitles(
			questionVideoPaths,
			answerVideoPaths,
			[questionAudioPath, answerAudioPath],
			subtitles,
			outputPath,
			{ questionAudioDuration, answerAudioDuration }
		);

		console.log('Dynamic video created successfully at', outputPath);

		[...questionVideoPaths, ...answerVideoPaths].forEach(filePath => {
			fs.unlink(filePath, err => {
				if (err) console.error('Error deleting file:', err);
			});
		});
	} catch (error) {
		console.error('An error occurred:', error.message);
	}
}

main();
