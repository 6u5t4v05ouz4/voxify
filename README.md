# VOXIFY - Desktop Text-to-Speech Application

VOXIFY is a cross-platform desktop application built with Electron that narrates any selected text using OpenAI's text-to-speech API. The app is designed for simplicity, quick access, and robust handling of various text and audio scenarios.

---

## Features

- Capture and narrate selected text from any application using a global keyboard shortcut (`Ctrl+Shift+N`)
- System clipboard integration for seamless text retrieval
- Integration with OpenAI API for high-quality text-to-speech conversion
- Audio playback using HTML5 Audio or native APIs
- System tray icon for quick access and minimal UI footprint
- Simple, intuitive interface with easy configuration
- Error handling with user-friendly messages for API, network, and playback issues
- Support for long texts (automatic chunking if needed)
- Cross-platform support: Windows, macOS, and Linux
- Customizable settings, including OpenAI API key management
- Compatibility and basic testing guidance
- Packaging and distribution using electron-builder

---

## Prerequisites

- Node.js (v14 or later)
- npm (included with Node.js)
- An OpenAI API key (required for text-to-speech)

---

## Installation

1. Clone this repository or download the source code.
2. Install dependencies:
   ```bash
   npm install
   ```

---

## Usage

1. Start the application:
   ```bash
   npm start
   ```
2. The VOXIFY icon will appear in the system tray.
3. Click the tray icon to open the settings window.
4. Enter your OpenAI API key and save it.
5. To narrate text:
   - Select text in any application
   - Copy it to the clipboard (usually `Ctrl+C`)
   - Press `Ctrl+Shift+N` to hear the text read aloud

---

## Hotkeys

- `Ctrl+Shift+N`: Narrate clipboard text
- Click tray icon: Show/hide the application window

---

## Configuration

- **OpenAI API Key:** Required for text-to-speech. Enter and save it in the settings window.
- **Audio Output:** Uses system default audio device via HTML5 Audio or native APIs.
- **Startup:** The app can be configured to start minimized in the tray (see settings).

---

## Error Handling & Troubleshooting

- **API/Network Errors:** User-friendly messages are shown for API or network issues.
- **Long Texts:** If the text exceeds API limits, VOXIFY will automatically split and narrate in parts.
- **Audio Playback Issues:** Ensure your system sound is enabled. Check the app logs or tray notifications for details.

---

## Testing & Compatibility

- The app is tested on Windows, macOS, and Linux.
- Basic manual tests: try copying and narrating texts of various lengths, check error messages by disconnecting the internet or using an invalid API key.
- Automated tests can be added for core modules (see `todo.md` for future improvements).

---

## Building for Distribution

VOXIFY uses [electron-builder](https://www.electron.build/) for packaging and distribution.

To create a distributable package:

```bash
npm install -g electron-builder

# For Windows
npx electron-builder --win

# For macOS
npx electron-builder --mac

# For Linux
npx electron-builder --linux
```

Output packages will be in the `dist/` directory.

---

## License

ISC

---

## Acknowledgements

- Built with [Electron](https://electronjs.org/)
- Uses [OpenAI's text-to-speech API](https://platform.openai.com/docs/guides/text-to-speech)
- Icons by [Icons8](https://icons8.com/)

---

## Project Roadmap

See [`todo.md`](./todo.md) for a detailed implementation plan and future enhancements.
