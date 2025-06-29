const express = require('express');
const path = require('path');
const fs = require('fs');
const i18n = require('i18n');
const cookieParser = require('cookie-parser');
const { title } = require('process');

i18n.configure({
    locales: ['tr', 'en'],
    directory: path.join(__dirname, 'locales'),
    defaultLocale: 'tr',
    cookie: 'lang',
    queryParameter: 'lang',
    autoReload: true,
    updateFiles: false,
    syncFiles: false
});

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use('/s', express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1);
app.use(cookieParser());
app.use(i18n.init);

// Locale Middleware
app.use((req, res, next) => {
    const lang = req.query.lang;

    if (lang && ['tr', 'en'].includes(lang)) {
        res.cookie('lang', lang, { maxAge: 1000 * 60 * 60 * 24 * 365 * 10 });
        req.setLocale(lang);

        const cleanedUrl = req.originalUrl.replace(/([&?])lang=[^&]+(&)?/, (match, p1, p2) => {
            if (p1 === '?' && !p2) return '';
            return p1 === '?' ? '?' : p1;
        }).replace(/[?&]$/, '');

        return res.redirect(cleanedUrl || '/');
    }

    const cookieLang = req.cookies.lang;
    if (cookieLang && ['tr', 'en'].includes(cookieLang)) {
        req.setLocale(cookieLang);
    } else {
        req.setLocale('tr');
        res.cookie('lang', 'tr', { maxAge: 1000 * 60 * 60 * 24 * 365 * 10 });
    }

    res.locals.__ = res.__;
    res.locals.locale = req.getLocale();
    next();
});

// Routes
app.get('/', (req, res) => {
    res.render('index', { 
        __: res.__,
        featured: getFeaturedContent(),
        categories: getCategories(),
        adsenseId: process.env.ADSENSE_ID,
        title: res.__('page.home'),
        currentUrl: req.originalUrl,
        adsenseId: process.env.ADSENSE_ID,
        currentPath: req.path,
    });
});

app.get('/d/:title', (req, res, next) => {
    const titleId = req.params.title;
    const film = getFilmData(titleId);
    
    if (!film || film.id !== titleId) {
        return next();
    }

    res.render('title', { 
        __: res.__,
        film: film,
        related: getRelatedContent(titleId),
        title: film.title,
        currentUrl: req.originalUrl,
        currentPath: req.path,
        adsenseId: process.env.ADSENSE_ID
    });
});

// 404 Handler
app.use((req, res) => {
    res.status(404).render('404', {
        __: res.__,
        title: res.__('error.404'),
        currentPath: req.path
    });
});

// Data Helpers
function getFeaturedContent() {
    return [
        {
            id: "inception",
            title: "Inception",
            thumbnail: "/s/images/inception.jpg",
            year: 2010,
            rating: "8.8/10"
        },
        // Add more featured items
    ];
}

function getCategories() {
    return [
        {
            name: "Popular",
            items: [
                {
                    id: "dark-knight",
                    title: "The Dark Knight",
                    thumbnail: "/s/images/dark-knight.jpg",
                    year: 2008,
                    rating: "9.0/10"
                },
                // Add more items
            ]
        },
        // Add more categories
    ];
}

function getFilmData(id) {
    // In a real app, this would come from a database
    const films = {
        "inception": {
            id: "inception",
            title: "Inception",
            description: "A thief who steals corporate secrets through the use of dream-sharing technology is given the inverse task of planting an idea into the mind of a C.E.O.",
            year: 2010,
            rating: "8.8/10",
            duration: "2h 28m",
            videoUrl: "/s/videos/inception.mp4",
            seasons: null
        },
        "dark-knight": {
            id: "dark-knight",
            title: "The Dark Knight",
            description: "When the menace known as the Joker wreaks havoc and chaos on the people of Gotham, Batman must accept one of the greatest psychological and physical tests of his ability to fight injustice.",
            year: 2008,
            rating: "9.0/10",
            duration: "2h 32m",
            videoUrl: "/s/videos/dark-knight.mp4",
            seasons: null
        }
        // Add more films
    };
    return films[id] || null; // Fallback to inception if not found
}

function getRelatedContent(currentId) {
    // In a real app, this would be based on current film's genre/tags
    return [
        {
            id: "interstellar",
            title: "Interstellar",
            thumbnail: "/s/images/interstellar.jpg",
            year: 2014,
            rating: "8.6/10"
        },
        // Add more related items
    ];
}

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});