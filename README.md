# D.A.O. Browser

<div align="center">

![D.A.O. Browser](https://img.shields.io/badge/D.A.O.-Browser-blue?style=for-the-badge)
![Electron](https://img.shields.io/badge/Electron-40.1.0-47848F?style=for-the-badge&logo=electron)
![Python](https://img.shields.io/badge/Python-3.x-3776AB?style=for-the-badge&logo=python)
![License](https://img.shields.io/badge/license-MIT-orange?style=for-the-badge)

**Distraction-free, Ad-free, Optimized Web Browser**

*A modern Chromium-based browser with AI-powered article summarization, focus mode, exam mode, and privacy features*

[Features](#-features) • [Installation](#-installation) • [Usage](#-usage) • [Tech Stack](#-tech-stack) • [Development](#-development)

</div>

---

## About

**D.A.O. (Distraction-free, Ad-free, Optimized)** is a privacy-focused web browser built with Electron, featuring intelligent content management, AI-powered article summarization, multi-profile support, focus mode for productivity, and exam mode for secure testing environments. Designed for users who value clean browsing experiences without ads, trackers, or distractions.

### Why D.A.O.?

- **Ad-Free Browsing**: Built-in ad-blocker using community-maintained filter lists
- **AI Summarization**: Extract and summarize article content using NLP
- **Multi-Profile Support**: Separate browsing data for different users/contexts with profile isolation
- **Focus Mode**: Block social media and distractions during productive sessions
- **Exam Mode**: Secure lockdown mode for online exams with real-time monitoring
- **Content Filter**: Block inappropriate/NSFW websites
- **Modern Dark UI**: Sleek, professional interface
- **Fast & Lightweight**: Minimal resource usage with efficient rendering
- **Privacy First**: WebView isolation and tracker blocking

---

## Features

### Ad-Blocker & Privacy Shield
- **Community Filter Lists**: Uses Peter Lowe's ad servers list (~3,500 domains) and fallback domains
- **Real-time Blocking**: Blocks ads, trackers, and malicious scripts before they load
- **Shield Statistics**: Live counter showing blocked elements per page
- **Toggle Control**: Enable/disable ad-blocker per session from settings
- **Performance**: <10ms filter matching for seamless browsing

### AI Article Summarization
- **Intelligent Extraction**: Automatically extracts main article content from web pages
- **NLP Summarization**: Uses LSA (Latent Semantic Analysis) algorithm for smart summarization
- **Customizable Length**: Choose 3, 5, or 10 sentence summaries
- **Side Panel UI**: Clean summary display with copy-to-clipboard support
- **Keyboard Shortcut**: `Ctrl+Shift+S` to instantly summarize current page

### Multi-Profile System
- **Separate Profiles**: Create and switch between multiple browser profiles
- **Isolated History**: Each profile maintains its own browsing history
- **Profile Switching**: Quick profile switcher in the toolbar
- **Persistent Settings**: Profile-specific preferences and data

### Browsing History
- **Full History Tracking**: Automatic recording of visited pages
- **Profile-Aware**: History is separated by profile
- **Search & Filter**: Search history by URL or page title
- **Statistics**: View total visits, unique sites, and time spent
- **Auto-Refresh**: History page automatically updates when new pages are visited
- **Keyboard Shortcut**: `Ctrl+H` to open history

### Exam Mode
- **Secure Lockdown**: Restrict browsing to allowed URLs only during exams
- **URL Filtering**: Configure allowed domains for exam sessions
- **Session Tracking**: Log exam activity for monitoring
- **Profile Integration**: Exam mode works with the profile system
- **Visual Indicators**: Clear exam mode banner and status

### Content Filtering
- **Site Blocking**: Block inappropriate or unwanted websites
- **Custom Block Lists**: Add sites to block list
- **Clean Block Page**: Professional blocked site notification
- **Safe Browsing**: Protection from harmful content

### Find in Page
- **Fast Search**: Real-time text search within web pages
- **Match Navigation**: Jump between matches with up/down arrows
- **Match Counter**: Shows current match number and total matches found
- **Keyboard Shortcuts**:
  - `Ctrl+F` - Open find bar
  - `Enter` - Next match
  - `Shift+Enter` - Previous match
  - `Esc` - Close find bar

### Core Browser Features
- **Multi-Tab Management**: Create, close, switch between unlimited tabs
- **Navigation Controls**: Back, forward, reload, home buttons
- **Smart Address Bar**: Direct URL entry or Google search
- **Secure WebViews**: Isolated rendering contexts for each tab
- **Modern UI**: Professional dark theme with Font Awesome icons
- **Settings Dialog**: Configure JavaScript, history, ad-blocker preferences
- **Error Pages**: Clean, minimal error page design

### Keyboard Shortcuts
| Shortcut | Action |
|----------|--------|
| `Ctrl+T` | New tab |
| `Ctrl+W` | Close current tab |
| `Ctrl+Tab` | Next tab |
| `Ctrl+Shift+Tab` | Previous tab |
| `Ctrl+R` | Reload page |
| `Ctrl+L` | Focus address bar |
| `Ctrl+F` | Find in page |
| `Ctrl+H` | Open history |
| `Ctrl+Shift+S` | Summarize article |
| `Alt+Left` | Navigate back |
| `Alt+Right` | Navigate forward |

---

## Installation

### Prerequisites
- **Node.js** (v18 or higher)
- **Python** (v3.8 or higher) - For AI summarization backend
- **npm** (comes with Node.js)
- **PyInstaller** (`pip install pyinstaller`) - For backend packaging

For reproducible backend build dependencies:

```bash
pip install -r DAO_Browser/backend/requirements-build.txt
```

### Quick Start

1. **Clone the Repository**
   ```bash
   git clone https://github.com/yourusername/DAO-BROWSER.git
   cd DAO-BROWSER/DAO_Browser
   ```

2. **Install Dependencies**
   ```bash
   # Install browser dependencies
   npm install

   # Install Python backend dependencies
   pip install -r backend/requirements.txt

   # Download NLTK data (required for summarization)
   python -c "import nltk; nltk.download('punkt')"
   ```

3. **Download Ad-Blocker Filter List**
   ```bash
   # Download EasyList.txt to DAO_Browser/ directory
   # Or visit: https://easylist.to/easylist/easylist.txt
   ```

---

## Usage

### Starting the Browser

**Option 1: Browser Only (Auto-start backend)**
```bash
npm start
```

**Option 2: Browser + Manual Backend (Fallback)**

Open **two terminals**:

**Terminal 1 - Start Python Backend:**
```bash
cd DAO_Browser/backend
python summarizer.py
```
*Keep this terminal running. Backend will start on http://localhost:5000*

**Terminal 2 - Start Browser:**
```bash
cd DAO_Browser
npm start
```

### Using Features

**Ad-Blocker:**
- Click the **Shield icon** in toolbar to see blocked elements count
- Toggle ad-blocker in Settings icon

**Article Summarization:**
1. Navigate to any article/blog post
2. Press `Ctrl+Shift+S` or click **Summarize button**
3. Summary appears in right-side panel
4. Click **Copy** to copy summary to clipboard
5. Adjust sentence count (3/5/10) and regenerate

**Profile Management:**
1. Click the profile icon in the toolbar
2. Select an existing profile or create a new one
3. Each profile has separate history and settings

**Browsing History:**
1. Press `Ctrl+H` or click the history icon
2. View, search, or clear your browsing history
3. Click any entry to revisit the page

**Exam Mode:**
1. Start an exam session with allowed URLs configured
2. Browser restricts navigation to allowed domains only
3. Exam activity is logged for monitoring

**Find in Page:**
1. Press `Ctrl+F`
2. Type search term
3. Use arrows or Enter/Shift+Enter to navigate matches

**Settings:**
- Click the settings icon in toolbar
- Configure JavaScript, history tracking, ad-blocker
- View keyboard shortcuts reference

---

## Tech Stack

### Frontend (Browser UI)
- **Electron** v40.1.0 - Cross-platform desktop framework
- **Chromium** 134.x - Rendering engine (bundled with Electron)
- **JavaScript** (ES6+) - Application logic
- **HTML5/CSS3** - User interface
- **Font Awesome** 6.4.0 - Icon library
- **WebView API** - Isolated content rendering

### Backend (API & AI)
- **Python** 3.x - Backend runtime
- **Flask** 3.0.0 - HTTP server framework
- **Flask-CORS** - Cross-origin request handling
- **SQLite** - Local database for history and profiles
- **NLTK** 3.8.1 - Natural Language Toolkit
- **Sumy** 0.11.0 - Text summarization library
- **LSA Algorithm** - Latent Semantic Analysis for summarization

### Ad-Blocking
- **EasyList** - Community-maintained filter list (100,000+ rules)
- **Custom Parser** - JavaScript filter list parser
- **Regex Matching** - Pattern-based URL blocking

---

## Project Structure

```
DAO_Browser/
├── src/
│   ├── main/
│   │   └── main.js                    # Electron main process
│   ├── preload/
│   │   └── preload.js                 # Secure IPC bridge
│   └── renderer/
│       ├── index.html                 # Main browser UI
│       ├── renderer.js                # Browser logic (tabs, navigation)
│       ├── styles.css                 # Main styles
│       ├── css/
│       │   ├── theme.css              # Dark theme variables
│       │   ├── settings.css           # Settings dialog styles
│       │   ├── find-bar.css           # Find bar styles
│       │   ├── summary-panel.css      # Summary panel styles
│       │   └── exam-mode.css          # Exam mode styles
│       ├── components/
│       │   ├── ProfileSwitcher.js     # Profile management
│       │   ├── ExamModeManager.js     # Exam mode controller
│       │   ├── ExamModeLockdown.js    # Exam URL filtering
│       │   └── ExamSessionBanner.js   # Exam status banner
│       ├── modules/
│       │   ├── settings-dialog.js     # Settings UI
│       │   ├── find-bar.js            # Find in page
│       │   ├── history-page.js        # History page logic
│       │   └── shortcuts-page.js      # Shortcuts page
│       ├── pages/
│       │   ├── history.html           # Browsing history page
│       │   ├── shortcuts.html         # Keyboard shortcuts page
│       │   ├── error.html             # Connection error page
│       │   ├── blocked.html           # Site blocked page
│       │   └── exam-blocked.html      # Exam mode blocked page
│       └── utils/
│           └── contentExtractor.js    # Article extraction
├── backend/
│   ├── summarizer.py                  # Flask API server
│   ├── database.py                    # SQLite database operations
│   ├── requirements.txt               # Python dependencies
│   ├── browser_history.db             # History database
│   ├── api/
│   │   ├── profiles.py                # Profile API endpoints
│   │   └── exam.py                    # Exam mode API endpoints
│   └── models/
│       ├── profile.py                 # Profile data model
│       └── exam_session.py            # Exam session model
├── package.json                       # Node dependencies
├── EasyList.txt                       # Ad-blocker filter list
└── README.md                          # This file
```

---

## Development

### Running in Development Mode
```bash
# Terminal 1: Backend
cd backend
python summarizer.py

# Terminal 2: Browser
npm start
```

### Building for Production
```bash
# Build Python backend executable (PyInstaller)
npm run build:backend

# Build Windows NSIS installer
npm run dist:win
```

Installer artifacts are generated in:

- `DAO_Browser/release/` - Windows installer (`.exe`)
- `DAO_Browser/backend/dist/dao_backend/` - packaged backend runtime

### Debugging
- **DevTools**: Press `F12` or `Ctrl+Shift+I` in the browser
- **Main Process**: Add `console.log()` in `main.js` - Check terminal output
- **Renderer Process**: Add `console.log()` in `renderer.js` - Check browser DevTools
- **Backend**: Check Flask terminal for API logs

---

## Known Issues

1. **Backend requires manual start** - Python server must be running on port 5000 for history and summarization
2. **EasyList.txt download** - Must be manually downloaded and placed in project root
3. **No auto-updates** - Browser doesn't check for updates automatically

---

## Contributing

Contributions are welcome! Here's how you can help:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines
- Follow existing code style
- Test thoroughly before submitting PR
- Update README if adding new features
- Add comments for complex logic

---

## License

This project is licensed under the **MIT License**. See [LICENSE](LICENSE) file for details.

---

## Acknowledgments

- **Electron Team** - Amazing cross-platform framework
- **EasyList Contributors** - Comprehensive ad-blocking filters
- **NLTK & Sumy Teams** - Powerful NLP libraries
- **Font Awesome** - Beautiful icon library
- **Flask Team** - Lightweight Python web framework

---

<div align="center">

**Built with Electron + Python**

*D.A.O. Browser - Browse Smart, Browse Clean*

</div>
