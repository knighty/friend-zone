#! python3.7

import argparse
import os
import numpy as np
import speech_recognition as sr
import whisper
import torch
import json

from datetime import datetime, UTC, timedelta
from queue import Queue
from time import sleep, time
from sys import platform


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="medium", help="Model to use",
                        choices=["tiny", "base", "small", "medium", "large"])
    parser.add_argument("--non_english", action='store_true',
                        help="Don't use the english model.")
    parser.add_argument("--energy_threshold", default=1000,
                        help="Energy level for mic to detect.", type=int)
    parser.add_argument("--min_probability", default=0.5,
                        help="Energy level for mic to detect.", type=float)
    parser.add_argument("--record_timeout", default=2,
                        help="How real time the recording is in seconds.", type=float)
    parser.add_argument("--phrase_timeout", default=3,
                        help="How much empty space between recordings before we "
                             "consider it a new line in the transcription.", type=float)
    if 'linux' in platform:
        parser.add_argument("--default_microphone", default='pulse',
                            help="Default microphone name for SpeechRecognition. "
                                 "Run this with 'list' to view available Microphones.", type=str)
    args = parser.parse_args()

    print(args, flush=True)

    # The last time a recording was retrieved from the queue.
    phrase_time = None
    # Thread safe Queue for passing data from the threaded recording callback.
    data_queue = Queue()
    # We use SpeechRecognizer to record our audio because it has a nice feature where it can detect when speech ends.
    recorder = sr.Recognizer()
    recorder.energy_threshold = args.energy_threshold
    # Definitely do this, dynamic energy compensation lowers the energy threshold dramatically to a point where the SpeechRecognizer never stops recording.
    recorder.dynamic_energy_threshold = False

    # Important for linux users.
    # Prevents permanent application hang and crash by using the wrong Microphone
    if 'linux' in platform:
        mic_name = args.default_microphone
        if not mic_name or mic_name == 'list':
            print("Available microphone devices are: ")
            for index, name in enumerate(sr.Microphone.list_microphone_names()):
                print(f"Microphone with name \"{name}\" found")
            return
        else:
            for index, name in enumerate(sr.Microphone.list_microphone_names()):
                if mic_name in name:
                    source = sr.Microphone(sample_rate=16000, device_index=index)
                    break
    else:
        source = sr.Microphone(sample_rate=16000)

    # Load / Download model
    model = args.model
    if args.model != "large" and not args.non_english:
        model = model + ".en"
    audio_model = whisper.load_model(model)

    record_timeout = args.record_timeout
    phrase_timeout = args.phrase_timeout

    transcription = ['']

    with source:
        recorder.adjust_for_ambient_noise(source)

    def record_callback(_, audio:sr.AudioData) -> None:
        """
        Threaded callback function to receive audio data when recordings finish.
        audio: An AudioData containing the recorded bytes.
        """
        # Grab the raw bytes and push it into the thread safe queue.
        data = audio.get_raw_data()
        data_queue.put(data)

    # Create a background thread that will pass us raw audio bytes.
    # We could do this manually but SpeechRecognizer provides a nice helper.
    recorder.listen_in_background(source, record_callback, phrase_time_limit=1)

    # Cue the user that we're ready to go.
    print("Model loaded.\n", flush=True)

    audio_data = b''
    id = 0
    last_text = ''
    last_new_text_time = time()
    complete = False
    while True:
        try:
            now = time()
            # Pull raw recorded audio from the queue.
            if not data_queue.empty():
                phrase_complete = False
                # If enough time has passed between recordings, consider the phrase complete.
                # Clear the current working audio buffer to start over with the new data.
                if (phrase_time and now - phrase_time > phrase_timeout) or len(audio_data) > 1000000 or complete:
                    print("new phrase started\n", flush=True);
                    id = id + 1
                    last_text = ''
                    phrase_complete = True
                    complete = False
                    audio_data = b''
                
                # Combine audio data from queue
                audio_data = audio_data + b''.join(data_queue.queue)
                data_queue.queue.clear()
                
                # Convert in-ram buffer to something the model can use directly without needing a temp file.
                # Convert data from 16 bit wide integers to floating point with a width of 32 bits.
                # Clamp the audio stream frequency to a PCM wavelength compatible default of 32768hz max.
                audio_np = np.frombuffer(audio_data, dtype=np.int16).astype(np.float32) / 32768.0

                # Read the transcription.
                print("transcribing " + str(round(len(audio_data) / 1000,0)) + "kb...\n", flush=True);
                start = time();
                result = audio_model.transcribe(audio_np, fp16=torch.cuda.is_available(), initial_prompt='A conversation between friends called Knighty, Lethallin, Megadanxzero, Dan, PHN, Leth, Graeme, Peter, Alan')
                end = time();
                print("transcribed in " + str(round(end - start, 2)) + "s\n", flush=True);
                #print(result);
                response = [];
                text = ""
                for segment in result['segments']:
                    response.append({
                        "text": segment['text'],
                        "probability": segment['no_speech_prob']
                    })
                    text = text + "" if segment['no_speech_prob'] > args.min_probability else segment['text']

                if text == last_text:
                    if now > last_new_text_time - 2:
                        complete = True
                else:
                    last_text = text
                    last_new_text_time = time()

                if len(response) > 0:
                    print("subtitle " + str(id) + " " + json.dumps(response) + "\n", flush=True)

                # This is the last time we received new audio data from the queue.
                phrase_time = now
            else:
                # Infinite loops are bad for processors, must sleep.
                sleep(0.05)
        except KeyboardInterrupt:
            break

    print("\n\nTranscription:")
    for line in transcription:
        print(line)


if __name__ == "__main__":
    main()
