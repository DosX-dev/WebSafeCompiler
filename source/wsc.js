<!DOCTYPE html>
<html lang="en" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>VCom Team | ViniLog</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700&family=Oxanium:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <script src="https://cdn.jsdelivr.net/npm/typed.js@2.0.12"></script>
    <style>
        :root {
            --primary: #6e00ff;
            --secondary: #ff00aa;
            --dark: #0a0a0a;
            --darker: #050505;
            --light: #f0f0f0;
        }
        
        body {
            font-family: 'Oxanium', sans-serif;
            background-color: var(--darker);
            color: var(--light);
            overflow-x: hidden;
        }
        
        .title-font {
            font-family: 'Orbitron', sans-serif;
        }
        
        .gradient-text {
            background: linear-gradient(90deg, var(--primary), var(--secondary));
            -webkit-background-clip: text;
            background-clip: text;
            color: transparent;
        }
        
        .glow {
            text-shadow: 0 0 10px rgba(110, 0, 255, 0.7);
        }
        
        .card-glow {
            box-shadow: 0 0 15px rgba(110, 0, 255, 0.3);
        }
        
        .card-glow:hover {
            box-shadow: 0 0 25px rgba(110, 0, 255, 0.5);
            transform: translateY(-5px);
        }
        
        .status-dot {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            position: absolute;
            top: 10px;
            right: 10px;
        }
        
        .online {
            background-color: #00ff00;
            box-shadow: 0 0 10px #00ff00;
        }
        
        .offline {
            background-color: #ff0000;
            box-shadow: 0 0 10px #ff0000;
        }
        
        .pulse {
            animation: pulse 2s infinite;
        }

        .developing {
            background-color: #FFFF00;
            box-shadow: 0 0 10px #FFFF00;
        }
        
        @keyframes pulse {
            0% {
                transform: scale(0.95);
                box-shadow: 0 0 0 0 rgba(110, 0, 255, 0.7);
            }
            70% {
                transform: scale(1);
                box-shadow: 0 0 0 10px rgba(110, 0, 255, 0);
            }
            100% {
                transform: scale(0.95);
                box-shadow: 0 0 0 0 rgba(110, 0, 255, 0);
            }
        }
        
        .slide-in {
            animation: slideIn 0.5s forwards;
        }
        
        @keyframes slideIn {
            from {
                transform: translateX(-100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
        
        .fade-in {
            animation: fadeIn 1s forwards;
        }
        
        @keyframes fadeIn {
            from {
                opacity: 0;
            }
            to {
                opacity: 1;
            }
        }
        
        ::-webkit-scrollbar {
            width: 8px;
        }
        
        ::-webkit-scrollbar-track {
            background: var(--darker);
        }
        
        ::-webkit-scrollbar-thumb {
            background: var(--primary);
            border-radius: 10px;
        }
        
        ::-webkit-scrollbar-thumb:hover {
            background: var(--secondary);
        }
        
        .auth-modal {
            background: rgba(5, 5, 5, 0.9);
            backdrop-filter: blur(10px);
        }
        
        .input-field {
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(110, 0, 255, 0.3);
            transition: all 0.3s;
        }
        
        .input-field:focus {
            border-color: var(--primary);
            box-shadow: 0 0 10px rgba(110, 0, 255, 0.5);
        }
        
        .neon-border {
            position: relative;
        }
        
        .neon-border::before {
            content: '';
            position: absolute;
            top: -2px;
            left: -2px;
            right: -2px;
            bottom: -2px;
            z-index: -1;
            background: linear-gradient(45deg, var(--primary), var(--secondary), var(--primary));
            background-size: 200%;
            border-radius: inherit;
            opacity: 0;
            transition: 0.5s;
        }
        
        .neon-border:hover::before {
            opacity: 1;
            animation: neonGlow 3s linear infinite;
        }
        
        @keyframes neonGlow {
            0% {
                background-position: 0% 50%;
            }
            50% {
                background-position: 100% 50%;
            }
            100% {
                background-position: 0% 50%;
            }
        }
    </style>
</head>
<body class="min-h-screen">
    <script type="module">
        import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
        import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-analytics.js";
        import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
        import { getDatabase, ref, set, onValue, push, remove } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js";
        
        const firebaseConfig = {
            apiKey: "AIzaSyDRU44w-Plp9cGIOPT_yAgaf5kamAinlB4",
            authDomain: "vcom-site.firebaseapp.com",
            projectId: "vcom-site",
            storageBucket: "vcom-site.appspot.com",
            messagingSenderId: "908713210379",
            appId: "1:908713210379:web:527bc5b9d470d288fecd0e",
            measurementId: "G-Y6QTJRB05X",
            databaseURL: "https://vcom-site-default-rtdb.firebaseio.com"
        };
        
        const app = initializeApp(firebaseConfig);
        const analytics = getAnalytics(app);
        const auth = getAuth(app);
        const database = getDatabase(app);
        
        onAuthStateChanged(auth, (user) => {
            const authButtons = document.getElementById('auth-buttons');
            const userProfile = document.getElementById('user-profile');
            const adminPanelBtn = document.getElementById('admin-panel-btn');
            
            if (user) {
                authButtons.classList.add('hidden');
                userProfile.classList.remove('hidden');
                checkAdminStatus(user.uid);
            } else {
                authButtons.classList.remove('hidden');
                userProfile.classList.add('hidden');
                adminPanelBtn.classList.add('hidden');
            }
        });
        
        function checkAdminStatus(uid) {
            const adminRef = ref(database, 'admins/' + uid);
            onValue(adminRef, (snapshot) => {
                const adminPanelBtn = document.getElementById('admin-panel-btn');
                if (snapshot.exists()) {
                    adminPanelBtn.classList.remove('hidden');
                } else {
                    adminPanelBtn.classList.add('hidden');
                }
            });
        }
        
        window.registerUser = function() {
            const email = document.getElementById('register-email').value;
            const password = document.getElementById('register-password').value;
            const username = document.getElementById('register-username').value;
            
            createUserWithEmailAndPassword(auth, email, password)
                .then((userCredential) => {
                    const user = userCredential.user;
                    set(ref(database, 'users/' + user.uid), {
                        username: username,
                        email: email,
                        joinDate: new Date().toISOString()
                    });
                    document.getElementById('auth-modal').classList.add('hidden');
                })
                .catch((error) => {
                    alert(error.message);
                });
        };
        
        window.loginUser = function() {
            const email = document.getElementById('login-email').value;
            const password = document.getElementById('login-password').value;
            
            signInWithEmailAndPassword(auth, email, password)
                .then(() => {
                    document.getElementById('auth-modal').classList.add('hidden');
                })
                .catch((error) => {
                    alert(error.message);
                });
        };
        
        window.logoutUser = function() {
            signOut(auth).catch((error) => {
                alert(error.message);
            });
        };
        
        function loadMods() {
            const modsRef = ref(database, 'mods');
            onValue(modsRef, (snapshot) => {
                const modsContainer = document.getElementById('mods-container');
                modsContainer.innerHTML = '';
                
                if (!snapshot.exists()) {
                    const defaultMods = {
                        "PhasmoCheatV": { name: "PhasmoCheatV", status: "❌", description: "Advanced cheating tool for Phasmophobia", icon: "ghost" },
                        "RepoCheatV": { name: "RepoCheatV", status: "✅", description: "Comprehensive repository of game cheats", icon: "box-open" },
                        "ThiefCheatV": { name: "ThiefCheatV", status: "✅", description: "Stealth tools for Thief simulator", icon: "user-secret" },
                        "CWCheatV": { name: "CWCheatV", status: "✅", description: "Content Warning cheat", icon: "gamepad" },
                        "PvZCheatV": { name: "PvZCheatV", status: "✅", description: "Plants vs Zombies enhancements", icon: "leaf" },
                        "PEAKCheatV": { name: "PEAKCheatV", status: "🛠️", description: "Tools for PEAK game (in development)", icon: "mountain" }
                    };
                    
                    Object.entries(defaultMods).forEach(([modId, mod]) => {
                        set(ref(database, `mods/${modId}`), mod);
                    });
                    
                    loadMods();
                    return;
                }
                
                snapshot.forEach((childSnapshot) => {
                    const mod = childSnapshot.val();
                    const modId = childSnapshot.key;
                    
                    const modCard = document.createElement('div');
                    modCard.className = 'relative bg-gray-900 rounded-lg overflow-hidden shadow-lg card-glow transition-all duration-300 hover:shadow-xl p-6';
                    modCard.innerHTML = `
                        <div class="status-dot ${mod.status === '✅' ? 'online' : mod.status === '❌' ? 'offline' : 'developing'}"></div>
                        <div class="flex items-center mb-4">
                            <div class="bg-gradient-to-r from-purple-700 to-pink-600 p-3 rounded-lg mr-4">
                                <i class="fas fa-${mod.icon || 'gamepad'} text-white text-xl"></i>
                            </div>
                            <div>
                                <h3 class="text-xl font-bold text-white">${mod.name || 'Unnamed Mod'}</h3>
                                <p class="text-gray-400">${mod.category || 'Game Modification'}</p>
                            </div>
                        </div>
                        <p class="text-gray-300 mb-4">${mod.description || 'No description available.'}</p>
                        <div class="flex justify-between items-center">
                            <span class="text-sm ${mod.status === '✅' ? 'text-green-400' : mod.status === '❌' ? 'text-red-400' : 'text-yellow-400'}">Status: ${mod.status || '❌'}</span>
                            <button onclick="openModDetails('${modId}')" class="bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-700 hover:to-pink-600 text-white px-4 py-2 rounded-lg transition-all duration-300">
                                Details
                            </button>
                        </div>
                    `;
                    modsContainer.appendChild(modCard);
                });
            });
        }
        
        window.openModDetails = function(modId) {
            const modRef = ref(database, 'mods/' + modId);
            onValue(modRef, (snapshot) => {
                const mod = snapshot.val();
                document.getElementById('mod-details-name').textContent = mod.name;
                document.getElementById('mod-details-status').textContent = mod.status;
                document.getElementById('mod-details-status').className = `text-sm ${mod.status === '✅' ? 'text-green-400' : 'text-red-400'}`;
                document.getElementById('mod-details-description').textContent = mod.description || 'No description available.';
                document.getElementById('mod-details-icon').className = `fas fa-${mod.icon || 'gamepad'} text-white text-4xl bg-gradient-to-r from-purple-700 to-pink-600 p-4 rounded-lg`;
                document.getElementById('mod-details-modal').classList.remove('hidden');
            });
        };
        
        window.closeModDetails = function() {
            document.getElementById('mod-details-modal').classList.add('hidden');
        };
        
        function loadNews() {
            const newsRef = ref(database, 'news');
            onValue(newsRef, (snapshot) => {
                const newsContainer = document.getElementById('news-container');
                newsContainer.innerHTML = '';
                
                snapshot.forEach((childSnapshot) => {
                    const newsItem = childSnapshot.val();
                    const newsId = childSnapshot.key;
                    
                    const newsCard = document.createElement('div');
                    newsCard.className = 'bg-gray-900 rounded-lg overflow-hidden shadow-lg p-6 mb-6';
                    newsCard.innerHTML = `
                        <div class="flex justify-between items-start mb-4">
                            <h3 class="text-xl font-bold text-white">${newsItem.title}</h3>
                            <span class="text-gray-400 text-sm">${new Date(newsItem.date).toLocaleDateString()}</span>
                        </div>
                        <p class="text-gray-300 mb-4">${newsItem.content}</p>
                        <div class="border-t border-gray-800 pt-4">
                            <h4 class="text-gray-400 mb-2">Comments</h4>
                            <div id="comments-${newsId}" class="mb-4"></div>
                            <div class="flex">
                                <input id="comment-input-${newsId}" type="text" placeholder="Add a comment..." class="flex-grow bg-gray-800 text-white px-4 py-2 rounded-l-lg focus:outline-none">
                                <button onclick="addComment('${newsId}')" class="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-r-lg transition-all duration-300">
                                    Post
                                </button>
                            </div>
                        </div>
                    `;
                    newsContainer.appendChild(newsCard);
                    loadComments(newsId);
                });
            });
        }
        
        function loadComments(newsId) {
            const commentsRef = ref(database, `news/${newsId}/comments`);
            onValue(commentsRef, (snapshot) => {
                const commentsContainer = document.getElementById(`comments-${newsId}`);
                commentsContainer.innerHTML = '';
                
                snapshot.forEach((childSnapshot) => {
                    const comment = childSnapshot.val();
                    const commentElement = document.createElement('div');
                    commentElement.className = 'bg-gray-800 rounded-lg p-3 mb-2';
                    commentElement.innerHTML = `
                        <div class="flex justify-between items-center mb-1">
                            <span class="font-bold text-purple-400">${comment.author}</span>
                            <span class="text-gray-500 text-xs">${new Date(comment.timestamp).toLocaleString()}</span>
                        </div>
                        <p class="text-gray-300">${comment.text}</p>
                    `;
                    commentsContainer.appendChild(commentElement);
                });
            });
        }
        
        window.addComment = function(newsId) {
            const user = auth.currentUser;
            if (!user) {
                alert('Please log in to comment');
                return;
            }
            
            const commentInput = document.getElementById(`comment-input-${newsId}`);
            const commentText = commentInput.value.trim();
            if (commentText === '') return;
            
            const userRef = ref(database, 'users/' + user.uid);
            onValue(userRef, (snapshot) => {
                const userData = snapshot.val();
                const username = userData.username || user.email.split('@')[0];
                const newCommentRef = push(ref(database, `news/${newsId}/comments`));
                set(newCommentRef, {
                    author: username,
                    text: commentText,
                    timestamp: new Date().toISOString()
                });
                commentInput.value = '';
            }, { onlyOnce: true });
        };
        
        window.openAdminPanel = function() {
            document.getElementById('admin-panel').classList.remove('hidden');
        };
        
        window.closeAdminPanel = function() {
            document.getElementById('admin-panel').classList.add('hidden');
        };
        
        window.addNewMod = function() {
            const modName = document.getElementById('new-mod-name').value;
            const modStatus = document.getElementById('new-mod-status').value;
            const modDescription = document.getElementById('new-mod-description').value;
            const modIcon = document.getElementById('new-mod-icon').value;
            
            if (!modName) {
                alert('Mod name is required');
                return;
            }
            
            const newModRef = push(ref(database, 'mods'));
            set(newModRef, {
                name: modName,
                status: modStatus,
                description: modDescription,
                icon: modIcon || 'gamepad'
            });
            
            document.getElementById('new-mod-name').value = '';
            document.getElementById('new-mod-description').value = '';
            document.getElementById('new-mod-icon').value = '';
            alert('Mod added successfully!');
        };
        
        window.addNewsItem = function() {
            const newsTitle = document.getElementById('news-title').value;
            const newsContent = document.getElementById('news-content').value;
            
            if (!newsTitle || !newsContent) {
                alert('Title and content are required');
                return;
            }
            
            const newNewsRef = push(ref(database, 'news'));
            set(newNewsRef, {
                title: newsTitle,
                content: newsContent,
                date: new Date().toISOString()
            });
            
            document.getElementById('news-title').value = '';
            document.getElementById('news-content').value = '';
            alert('News added successfully!');
        };
        
        document.addEventListener('DOMContentLoaded', function() {
            loadMods();
            loadNews();
            
            if (document.getElementById('typed')) {
                new Typed('#typed', {
                    strings: ['Game Modifications', 'Cheat Tools', 'Custom Software', 'VCom Team'],
                    typeSpeed: 50,
                    backSpeed: 30,
                    loop: true
                });
            }
            
            document.querySelectorAll('a[href^="#"]').forEach(anchor => {
                anchor.addEventListener('click', function(e) {
                    e.preventDefault();
                    const targetId = this.getAttribute('href');
                    if (targetId === '#') return;
                    const targetElement = document.querySelector(targetId);
                    if (targetElement) {
                        targetElement.scrollIntoView({ behavior: 'smooth' });
                    }
                });
            });
            
            window.showAuthModal = function(mode) {
                document.getElementById('auth-modal').classList.remove('hidden');
                if (mode === 'login') {
                    document.getElementById('login-form').classList.remove('hidden');
                    document.getElementById('register-form').classList.add('hidden');
                } else {
                    document.getElementById('login-form').classList.add('hidden');
                    document.getElementById('register-form').classList.remove('hidden');
                }
            };
            
            window.closeAuthModal = function() {
                document.getElementById('auth-modal').classList.add('hidden');
            };
            
            window.toggleMobileMenu = function() {
                document.getElementById('mobile-menu').classList.toggle('hidden');
            };
            
            document.querySelectorAll('#mobile-menu a').forEach(link => {
                link.addEventListener('click', function() {
                    document.getElementById('mobile-menu').classList.add('hidden');
                });
            });
            
            document.querySelectorAll('.modal').forEach(modal => {
                modal.addEventListener('click', function(e) {
                    if (e.target === this) {
                        this.classList.add('hidden');
                    }
                });
            });
            
            const canvas = document.getElementById('particles');
            const ctx = canvas.getContext('2d');
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            
            const particles = [];
            const particleCount = 100;
            
            for (let i = 0; i < particleCount; i++) {
                particles.push({
                    x: Math.random() * canvas.width,
                    y: Math.random() * canvas.height,
                    size: Math.random() * 3 + 1,
                    speedX: Math.random() * 1 - 0.5,
                    speedY: Math.random() * 1 - 0.5
                });
            }
            
            function animate() {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                
                for (let i = 0; i < particles.length; i++) {
                    const p = particles[i];
                    p.x += p.speedX;
                    p.y += p.speedY;
                    
                    if (p.x < 0 || p.x > canvas.width) p.speedX *= -1;
                    if (p.y < 0 || p.y > canvas.height) p.speedY *= -1;
                    
                    ctx.fillStyle = `rgba(110, 0, 255, ${p.size / 3})`;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                    ctx.fill();
                    
                    for (let j = i + 1; j < particles.length; j++) {
                        const p2 = particles[j];
                        const distance = Math.sqrt(Math.pow(p.x - p2.x, 2) + Math.pow(p.y - p2.y, 2));
                        
                        if (distance < 100) {
                            ctx.strokeStyle = `rgba(110, 0, 255, ${1 - distance / 100})`;
                            ctx.lineWidth = 0.5;
                            ctx.beginPath();
                            ctx.moveTo(p.x, p.y);
                            ctx.lineTo(p2.x, p2.y);
                            ctx.stroke();
                        }
                    }
                }
                requestAnimationFrame(animate);
            }
            animate();
            
            window.addEventListener('resize', function() {
                canvas.width = window.innerWidth;
                canvas.height = window.innerHeight;
            });
            
            const userMenu = document.getElementById('user-menu');
            const userDropdown = document.getElementById('user-dropdown');
            
            if (userMenu && userDropdown) {
                userMenu.addEventListener('click', function() {
                    userDropdown.classList.toggle('hidden');
                });
                
                document.addEventListener('click', function(event) {
                    if (!userMenu.contains(event.target) && !userDropdown.contains(event.target)) {
                        userDropdown.classList.add('hidden');
                    }
                });
            }
        });
    </script>

    <nav class="bg-gray-900 border-b border-gray-800 fixed w-full z-50">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="flex items-center justify-between h-16">
                <div class="flex items-center">
                    <div class="flex-shrink-0">
                        <a href="#" class="text-white title-font text-xl font-bold gradient-text glow">VCom Team</a>
                    </div>
                    <div class="hidden md:block">
                        <div class="ml-10 flex items-baseline space-x-4">
                            <a href="#" class="text-white hover:text-purple-400 px-3 py-2 rounded-md text-sm font-medium transition-all duration-300">Home</a>
                            <a href="#mods" class="text-gray-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium transition-all duration-300">Mods</a>
                            <a href="#news" class="text-gray-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium transition-all duration-300">News</a>
                            <a href="#contact" class="text-gray-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium transition-all duration-300">Contact</a>
                        </div>
                    </div>
                </div>
                <div class="hidden md:block">
                    <div class="ml-4 flex items-center md:ml-6">
                        <div id="auth-buttons" class="flex space-x-2">
                            <button onclick="showAuthModal('login')" class="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-all duration-300">Login</button>
                            <button onclick="showAuthModal('register')" class="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-all duration-300">Register</button>
                        </div>
                        <div id="user-profile" class="hidden flex items-center ml-4">
                            <button id="admin-panel-btn" onclick="openAdminPanel()" class="hidden bg-pink-600 hover:bg-pink-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-all duration-300 mr-2">
                                Admin Panel
                            </button>
                            <div class="relative">
                                <button class="max-w-xs bg-gray-800 rounded-full flex items-center text-sm focus:outline-none" id="user-menu">
                                    <span class="sr-only">Open user menu</span>
                                    <div class="h-8 w-8 rounded-full bg-gradient-to-r from-purple-600 to-pink-500 flex items-center justify-center">
                                        <i class="fas fa-user text-white"></i>
                                    </div>
                                </button>
                                <div id="user-dropdown" class="hidden origin-top-right absolute right-0 mt-2 w-48 rounded-md shadow-lg py-1 bg-gray-800 ring-1 ring-black ring-opacity-5">
                                    <a href="#" class="block px-4 py-2 text-sm text-gray-300 hover:bg-gray-700">Profile</a>
                                    <a href="#" class="block px-4 py-2 text-sm text-gray-300 hover:bg-gray-700">Settings</a>
                                    <a href="#" onclick="logoutUser()" class="block px-4 py-2 text-sm text-gray-300 hover:bg-gray-700">Sign out</a>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="-mr-2 flex md:hidden">
                    <button onclick="toggleMobileMenu()" type="button" class="bg-gray-900 inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-white hover:bg-gray-800 focus:outline-none">
                        <span class="sr-only">Open main menu</span>
                        <i class="fas fa-bars"></i>
                    </button>
                </div>
            </div>
        </div>

        <div id="mobile-menu" class="hidden md:hidden bg-gray-900 border-t border-gray-800">
            <div class="px-2 pt-2 pb-3 space-y-1 sm:px-3">
                <a href="#" class="text-white block px-3 py-2 rounded-md text-base font-medium">Home</a>
                <a href="#mods" class="text-gray-300 hover:text-white block px-3 py-2 rounded-md text-base font-medium">Mods</a>
                <a href="#news" class="text-gray-300 hover:text-white block px-3 py-2 rounded-md text-base font-medium">News</a>
                <a href="#contact" class="text-gray-300 hover:text-white block px-3 py-2 rounded-md text-base font-medium">Contact</a>
            </div>
            <div class="pt-4 pb-3 border-t border-gray-800">
                <div id="mobile-auth-buttons" class="px-5 space-y-2">
                    <button onclick="showAuthModal('login')" class="w-full bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-all duration-300">Login</button>
                    <button onclick="showAuthModal('register')" class="w-full bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-all duration-300">Register</button>
                </div>
                <div id="mobile-user-profile" class="hidden px-5 mt-4">
                    <div class="flex items-center">
                        <div class="h-10 w-10 rounded-full bg-gradient-to-r from-purple-600 to-pink-500 flex items-center justify-center">
                            <i class="fas fa-user text-white"></i>
                        </div>
                        <div class="ml-3">
                            <div class="text-base font-medium text-white">Username</div>
                            <div class="text-sm font-medium text-gray-400">user@example.com</div>
                        </div>
                    </div>
                    <div class="mt-3 space-y-1">
                        <button id="mobile-admin-panel-btn" onclick="openAdminPanel()" class="hidden w-full text-left block px-3 py-2 rounded-md text-base font-medium text-gray-400 hover:text-white hover:bg-gray-800">Admin Panel</button>
                        <a href="#" class="block px-3 py-2 rounded-md text-base font-medium text-gray-400 hover:text-white hover:bg-gray-800">Profile</a>
                        <a href="#" class="block px-3 py-2 rounded-md text-base font-medium text-gray-400 hover:text-white hover:bg-gray-800">Settings</a>
                        <a href="#" onclick="logoutUser()" class="block px-3 py-2 rounded-md text-base font-medium text-gray-400 hover:text-white hover:bg-gray-800">Sign out</a>
                    </div>
                </div>
            </div>
        </div>
    </nav>

    <header class="relative bg-gradient-to-b from-gray-900 to-black pt-32 pb-20">
        <div class="absolute inset-0 opacity-20">
            <div class="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-30"></div>
        </div>
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
            <div class="text-center">
                <h1 class="text-4xl md:text-6xl font-bold text-white title-font mb-4 slide-in">
                    Welcome to <span class="gradient-text glow">VCom Team</span>
                </h1>
                <p class="text-xl md:text-2xl text-gray-300 mb-8 max-w-3xl mx-auto fade-in">
                    Creating <span id="typed" class="gradient-text"></span> for gamers
                </p>
                <div class="flex flex-col sm:flex-row justify-center gap-4 fade-in">
                    <a href="#mods" class="bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-700 hover:to-pink-600 text-white px-8 py-3 rounded-lg font-medium transition-all duration-300 transform hover:scale-105 neon-border">
                        Explore Mods
                    </a>
                    <a href="#contact" class="bg-gray-800 hover:bg-gray-700 text-white px-8 py-3 rounded-lg font-medium transition-all duration-300 transform hover:scale-105 neon-border">
                        Contact Us
                    </a>
                </div>
            </div>
        </div>
        <div class="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-black to-transparent"></div>
    </header>

    <section id="mods" class="py-20 bg-black">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="text-center mb-16">
                <h2 class="text-3xl md:text-4xl font-bold text-white title-font mb-4">
                    Our <span class="gradient-text">Modifications</span>
                </h2>
                <p class="text-gray-400 max-w-2xl mx-auto">
                    High-quality game modifications created by our team. Each mod is carefully tested and maintained.
                </p>
            </div>
            
            <div id="mods-container" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                
            </div>
        </div>
    </section>

    <section id="news" class="py-20 bg-gray-900">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="text-center mb-16">
                <h2 class="text-3xl md:text-4xl font-bold text-white title-font mb-4">
                    Latest <span class="gradient-text">News</span>
                </h2>
                <p class="text-gray-400 max-w-2xl mx-auto">
                    Stay updated with our latest releases, announcements, and community news.
                </p>
            </div>
            
            <div id="news-container" class="max-w-3xl mx-auto">
                
            </div>
        </div>
    </section>

    <section id="contact" class="py-20 bg-black">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="text-center mb-16">
                <h2 class="text-3xl md:text-4xl font-bold text-white title-font mb-4">
                    Get In <span class="gradient-text">Touch</span>
                </h2>
                <p class="text-gray-400 max-w-2xl mx-auto">
                    Have questions or want to collaborate? Reach out to us through any of these channels.
                </p>
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
                <div class="bg-gray-900 rounded-lg overflow-hidden shadow-lg p-8 text-center card-glow hover:shadow-xl transition-all duration-300">
                    <div class="bg-gradient-to-r from-purple-600 to-pink-500 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
                        <i class="fas fa-envelope text-white text-2xl"></i>
                    </div>
                    <h3 class="text-xl font-bold text-white mb-2">Support Telegram</h3>
                    <p class="text-gray-400 mb-4">Support to Telegram (manager)</p>
                    <a href="https://t.me/Badly_Day" target="_blank" class="text-purple-400 hover:text-purple-300 transition-all duration-300">t.me/Badly_Day</a>
                </div>
                
                <div class="bg-gray-900 rounded-lg overflow-hidden shadow-lg p-8 text-center card-glow hover:shadow-xl transition-all duration-300">
                    <div class="bg-gradient-to-r from-purple-600 to-pink-500 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
                        <i class="fab fa-discord text-white text-2xl"></i>
                    </div>
                    <h3 class="text-xl font-bold text-white mb-2">Support Discord</h3>
                    <p class="text-gray-400 mb-4">Support to Discord (owner)</p>
                    <a href="https://discord.com/users/vinilog789" target="_blank" class="text-purple-400 hover:text-purple-300 transition-all duration-300">discord.com/users/vinilog789</a>
                </div>
                
                <div class="bg-gray-900 rounded-lg overflow-hidden shadow-lg p-8 text-center card-glow hover:shadow-xl transition-all duration-300">
                    <div class="bg-gradient-to-r from-purple-600 to-pink-500 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
                        <i class="fab fa-telegram text-white text-2xl"></i>
                    </div>
                    <h3 class="text-xl font-bold text-white mb-2">Telegram channel</h3>
                    <p class="text-gray-400 mb-4">For quick updates and announcements</p>
                    <a href="https://t.me/VComDev" target="_blank" class="text-purple-400 hover:text-purple-300 transition-all duration-300">t.me/VComDev</a>
                </div>
            </div>
        </div>
    </section>

    <footer class="bg-gray-900 border-t border-gray-800 py-8">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="flex flex-col md:flex-row justify-between items-center">
                <div class="flex items-center mb-4 md:mb-0">
                    <a href="#" class="text-white title-font text-xl font-bold gradient-text glow">VCom Team</a>
                    <span class="text-gray-400 ml-4">© 2025 All rights reserved</span>
                </div>
                <div class="flex space-x-6">
                    <a href="https://t.me/VComDev" class="text-gray-400 hover:text-white transition-all duration-300">
                        <i class="fab fa-telegram text-xl"></i>
                    </a>
                </div>
            </div>
        </div>
    </footer>

    <div id="auth-modal" class="fixed inset-0 z-50 hidden overflow-y-auto auth-modal">
        <div class="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div class="fixed inset-0 transition-opacity" aria-hidden="true">
                <div class="absolute inset-0 bg-black opacity-75"></div>
            </div>
            <span class="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
            <div class="inline-block align-bottom bg-gray-900 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full border border-gray-800">
                <div class="px-6 py-4 border-b border-gray-800">
                    <div class="flex justify-between items-center">
                        <h3 class="text-lg leading-6 font-medium text-white" id="modal-title">
                            Welcome to VCom Team
                        </h3>
                        <button onclick="closeAuthModal()" class="text-gray-400 hover:text-white focus:outline-none">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
                <div class="px-6 py-4">
                    <div id="login-form" class="hidden">
                        <div class="mb-4">
                            <label for="login-email" class="block text-sm font-medium text-gray-300 mb-2">Email</label>
                            <input type="email" id="login-email" class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white input-field focus:outline-none focus:ring-1 focus:ring-purple-500">
                        </div>
                        <div class="mb-6">
                            <label for="login-password" class="block text-sm font-medium text-gray-300 mb-2">Password</label>
                            <input type="password" id="login-password" class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white input-field focus:outline-none focus:ring-1 focus:ring-purple-500">
                        </div>
                        <div class="flex items-center justify-between mb-4">
                            <div class="flex items-center">
                                <input id="remember-me" name="remember-me" type="checkbox" class="h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-700 rounded bg-gray-800">
                                <label for="remember-me" class="ml-2 block text-sm text-gray-300">Remember me</label>
                            </div>
                            <div class="text-sm">
                                <a href="#" class="font-medium text-purple-400 hover:text-purple-300">Forgot password?</a>
                            </div>
                        </div>
                        <button onclick="loginUser()" class="w-full bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-700 hover:to-pink-600 text-white py-2 px-4 rounded-md font-medium transition-all duration-300 mb-4">
                            Sign In
                        </button>
                        <p class="text-center text-gray-400 text-sm">
                            Don't have an account? 
                            <button onclick="showAuthModal('register')" class="text-purple-400 hover:text-purple-300 font-medium">Register</button>
                        </p>
                    </div>
                    
                    <div id="register-form" class="hidden">
                        <div class="mb-4">
                            <label for="register-username" class="block text-sm font-medium text-gray-300 mb-2">Username</label>
                            <input type="text" id="register-username" class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white input-field focus:outline-none focus:ring-1 focus:ring-purple-500">
                        </div>
                        <div class="mb-4">
                            <label for="register-email" class="block text-sm font-medium text-gray-300 mb-2">Email</label>
                            <input type="email" id="register-email" class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white input-field focus:outline-none focus:ring-1 focus:ring-purple-500">
                        </div>
                        <div class="mb-6">
                            <label for="register-password" class="block text-sm font-medium text-gray-300 mb-2">Password</label>
                            <input type="password" id="register-password" class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white input-field focus:outline-none focus:ring-1 focus:ring-purple-500">
                        </div>
                        <button onclick="registerUser()" class="w-full bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-700 hover:to-pink-600 text-white py-2 px-4 rounded-md font-medium transition-all duration-300 mb-4">
                            Register
                        </button>
                        <p class="text-center text-gray-400 text-sm">
                            Already have an account? 
                            <button onclick="showAuthModal('login')" class="text-purple-400 hover:text-purple-300 font-medium">Sign In</button>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <div id="mod-details-modal" class="fixed inset-0 z-50 hidden overflow-y-auto auth-modal">
        <div class="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div class="fixed inset-0 transition-opacity" aria-hidden="true">
                <div class="absolute inset-0 bg-black opacity-75"></div>
            </div>
            <span class="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
            <div class="inline-block align-bottom bg-gray-900 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full border border-gray-800">
                <div class="px-6 py-4 border-b border-gray-800">
                    <div class="flex justify-between items-center">
                        <h3 class="text-lg leading-6 font-medium text-white" id="modal-title">
                            Mod Details
                        </h3>
                        <button onclick="closeModDetails()" class="text-gray-400 hover:text-white focus:outline-none">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
                <div class="px-6 py-4">
                    <div class="flex items-center mb-6">
                        <div class="mr-4">
                            <i id="mod-details-icon" class="fas fa-gamepad text-white text-4xl bg-gradient-to-r from-purple-700 to-pink-600 p-4 rounded-lg"></i>
                        </div>
                        <div>
                            <h3 id="mod-details-name" class="text-2xl font-bold text-white">Mod Name</h3>
                            <span id="mod-details-status" class="text-sm text-green-400">Status: ✅</span>
                        </div>
                    </div>
                    <div class="mb-6">
                        <h4 class="text-lg font-medium text-white mb-2">Description</h4>
                        <p id="mod-details-description" class="text-gray-300">No description available.</p>
                    </div>
                    <div class="mb-4">
                        <h4 class="text-lg font-medium text-white mb-2">Features</h4>
                        <ul class="list-disc list-inside text-gray-300">
                            <li>Feature 1</li>
                            <li>Feature 2</li>
                            <li>Feature 3</li>
                        </ul>
                    </div>
                    <div class="flex justify-end">
                        <button onclick="closeModDetails()" class="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-md font-medium transition-all duration-300 mr-2">
                            Close
                        </button>
                        <button class="bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-700 hover:to-pink-600 text-white px-4 py-2 rounded-md font-medium transition-all duration-300">
                            Download
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <div id="admin-panel" class="fixed inset-0 z-50 hidden overflow-y-auto auth-modal">
        <div class="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div class="fixed inset-0 transition-opacity" aria-hidden="true">
                <div class="absolute inset-0 bg-black opacity-75"></div>
            </div>
            <span class="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
            <div class="inline-block align-bottom bg-gray-900 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full border border-gray-800">
                <div class="px-6 py-4 border-b border-gray-800">
                    <div class="flex justify-between items-center">
                        <h3 class="text-lg leading-6 font-medium text-white" id="modal-title">
                            Admin Panel
                        </h3>
                        <button onclick="closeAdminPanel()" class="text-gray-400 hover:text-white focus:outline-none">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
                <div class="px-6 py-4">
                    <div class="mb-8">
                        <h4 class="text-lg font-medium text-white mb-4">Add New Mod</h4>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <div>
                                <label for="new-mod-name" class="block text-sm font-medium text-gray-300 mb-2">Mod Name</label>
                                <input type="text" id="new-mod-name" class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white input-field focus:outline-none focus:ring-1 focus:ring-purple-500">
                            </div>
                            <div>
                                <label for="new-mod-status" class="block text-sm font-medium text-gray-300 mb-2">Status</label>
                                <select id="new-mod-status" class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white input-field focus:outline-none focus:ring-1 focus:ring-purple-500">
                                    <option value="✅">✅ Available</option>
                                    <option value="❌">❌ Unavailable</option>
                                    <option value="🛠️">🛠️ In developer</option>
                                </select>
                            </div>
                        </div>
                        <div class="mb-4">
                            <label for="new-mod-description" class="block text-sm font-medium text-gray-300 mb-2">Description</label>
                            <textarea id="new-mod-description" rows="3" class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white input-field focus:outline-none focus:ring-1 focus:ring-purple-500"></textarea>
                        </div>
                        <div class="mb-4">
                            <label for="new-mod-icon" class="block text-sm font-medium text-gray-300 mb-2">Icon (Font Awesome class, e.g. "gamepad")</label>
                            <input type="text" id="new-mod-icon" class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white input-field focus:outline-none focus:ring-1 focus:ring-purple-500">
                        </div>
                        <button onclick="addNewMod()" class="bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-700 hover:to-pink-600 text-white px-4 py-2 rounded-md font-medium transition-all duration-300">
                            Add Mod
                        </button>
                    </div>
                    
                    <div>
                        <h4 class="text-lg font-medium text-white mb-4">Add News</h4>
                        <div class="mb-4">
                            <label for="news-title" class="block text-sm font-medium text-gray-300 mb-2">Title</label>
                            <input type="text" id="news-title" class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white input-field focus:outline-none focus:ring-1 focus:ring-purple-500">
                        </div>
                        <div class="mb-4">
                            <label for="news-content" class="block text-sm font-medium text-gray-300 mb-2">Content</label>
                            <textarea id="news-content" rows="5" class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white input-field focus:outline-none focus:ring-1 focus:ring-purple-500"></textarea>
                        </div>
                        <button onclick="addNewsItem()" class="bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-700 hover:to-pink-600 text-white px-4 py-2 rounded-md font-medium transition-all duration-300">
                            Publish News
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <div class="fixed bottom-6 right-6 z-40">
        <button onclick="window.scrollTo({top: 0, behavior: 'smooth'})" class="bg-gradient-to-r from-purple-600 to-pink-500 text-white w-12 h-12 rounded-full shadow-lg flex items-center justify-center hover:from-purple-700 hover:to-pink-600 transition-all duration-300 transform hover:scale-110">
            <i class="fas fa-arrow-up"></i>
        </button>
    </div>

    <canvas id="particles" class="fixed top-0 left-0 w-full h-full -z-10 opacity-20"></canvas>
</body>
</html>
