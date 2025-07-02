const express = require('express');
const path = require('path');
const fs = require('fs');
const i18n = require('i18n');
const cookieParser = require('cookie-parser');
const { title } = require('process');
const admin = require('firebase-admin');
const session = require('express-session');
require('dotenv').config();

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

const serviceAccount = {
  type: process.env.FIREBASE_TYPE,
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: process.env.FIREBASE_AUTH_URI,
  token_uri: process.env.FIREBASE_TOKEN_URI,
  auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
  client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
  universe_domain: process.env.FIREBASE_UNIVERSE_DOMAIN
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DB_URL
});
const db = admin.database();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use('/s', express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(i18n.init);
app.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: false
}));

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
    res.locals.user = req.session.user || null;
    next();
});

// Routes
app.get('/', async (req, res) => {
    res.render('index', { 
        __: res.__,
        featured: await getFeaturedContent(),
        categories: await getCategories(),
        adsenseId: process.env.ADSENSE_ID,
        title: res.__('page.home'),
        currentUrl: req.originalUrl,
        currentPath: req.path,
        user: req.session.user || null
    });
});

app.get('/d/:title', async (req, res, next) => {
    const titleId = req.params.title;
    const film = await getFilmData(titleId);
    
    if (!film || film.id !== titleId) {
        return next();
    }

    res.render('title', { 
        __: res.__,
        film: film,
        related: await getRelatedContent(titleId),
        title: film.title,
        currentUrl: req.originalUrl,
        currentPath: req.path,
        user: req.session.user || null
    });
});

// Render registration page
app.get('/register', (req, res) => {
    res.render('register', {
        __: res.__,
        locale: req.getLocale(),
        currentPath: req.path,
        user: req.session.user || null
    });
});

// Render login page
app.get('/login', (req, res) => {
    res.render('login', {
        __: res.__,
        locale: req.getLocale(),
        currentPath: req.path,
        user: req.session.user || null,
        title: res.__('page.login'),
        currentUrl: req.originalUrl,
    });
});

// Render profile page
app.get('/profile/:uid/view', async (req, res) => {
    const { uid } = req.params;
    try {
        const userSnap = await db.ref('users/' + uid).once('value');
        const userData = userSnap.val();
        res.render('profile', {
            __: res.__,
            locale: req.getLocale(),
            user: req.session.user || null,
            currentPath: req.path,
            title: res.__('page.profile'),
            currentUrl: req.originalUrl,
        });
    } catch (error) {
        res.render('profile', {
            __: res.__,
            locale: req.getLocale(),
            user: req.session.user || null,
            currentPath: req.path,
            title: res.__('page.profile'),
            currentUrl: req.originalUrl,
        });
    }
});

// User Registration
app.post('/register', async (req, res) => {
    const { email, password, displayName } = req.body;
    try {
        const userRecord = await admin.auth().createUser({
            email,
            password,
            displayName
        });
        // Store additional user info in Realtime DB
        await db.ref('users/' + userRecord.uid).set({
            email,
            displayName,
            createdAt: Date.now()
        });
        res.redirect('/profile/' + userRecord.uid + '/view');
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// User Login (returns a custom token)
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await admin.auth().getUserByEmail(email);
    req.session.user = { uid: user.uid, email: user.email };
    res.redirect('/profile/' + user.uid + '/view');
  } catch (error) {
    res.render('login', { error: error.message });
  }
});

// Get User Profile
app.get('/profile/:uid', async (req, res) => {
    const { uid } = req.params;
    try {
        const userSnap = await db.ref('users/' + uid).once('value');
        const userData = userSnap.val();
        if (!userData) return res.status(404).json({ success: false, error: 'User not found' });
        res.json({ success: true, user: userData });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// Admin middleware
function requireAdmin(req, res, next) {
    if (!req.session.user || !req.session.user.uid) {
        return res.redirect('/login');
    }
    db.ref('users/' + req.session.user.uid).once('value', (snapshot) => {
        const userData = snapshot.val();
        if (userData && userData.admin === true) {
            next();
        } else {
            res.status(403).send('Forbidden: Admins only');
        }
    });
}

// Admin panel route
app.get('/admin', requireAdmin, (req, res) => {
    res.render('admin', {
        __: res.__,
        locale: req.getLocale(),
        currentPath: req.path,
        currentUrl: req.protocol + '://' + req.get('host') + req.originalUrl,
        user: req.session.user || null,
        title: 'Admin Panel'
    });
});

// Add new film
app.post('/admin/films/add', requireAdmin, async (req, res) => {
    const { title, description, year, rating, thumbnail, videoUrl } = req.body;
    const id = title.toLowerCase().replace(/\s+/g, '-');
    await db.ref('films/all/' + id).set({
        id,
        title,
        description,
        year,
        rating,
        thumbnail,
        videoUrl
    });
    await db.ref('films/featured/' + id).set({
        id,
        title,
        thumbnail,
        year,
        rating
    });
    res.redirect('/admin');
});

// Add new season
app.post('/admin/seasons/add', requireAdmin, async (req, res) => {
    const { filmId, seasonNumber, seasonTitle } = req.body;
    await db.ref(`films/all/${filmId}/seasons/${seasonNumber}`).set({
        seasonNumber,
        seasonTitle
    });
    res.redirect('/admin');
});

// Add new episode
app.post('/admin/episodes/add', requireAdmin, async (req, res) => {
    const { filmId, seasonNumber, episodeNumber, episodeTitle, description, videoUrl } = req.body;
    await db.ref(`films/all/${filmId}/seasons/${seasonNumber}/episodes/${episodeNumber}`).set({
        episodeNumber,
        episodeTitle,
        description,
        videoUrl
    });
    res.redirect('/admin');
});

// 404 Handler
app.use((req, res) => {
    res.status(404).render('404', {
        __: res.__,
        title: res.__('error.404'),
        currentPath: req.path,
        currentUrl: req.originalUrl,
    });
});

// Data Helpers
async function getFeaturedContent() {
    const snapshot = await db.ref('films/featured').once('value');
    const data = snapshot.val();
    if (!data) return [];
    return Object.values(data);
}

async function getCategories() {
    const snapshot = await db.ref('films/categories').once('value');
    const data = snapshot.val();
    if (!data) return [];
    return Object.values(data);
}

async function getFilmData(id) {
    const snapshot = await db.ref(`films/all/${id}`).once('value');
    return snapshot.val() || null;
}

async function getRelatedContent(currentId) {
    const snapshot = await db.ref('films/related').once('value');
    const data = snapshot.val();
    if (!data) return [];
    return Object.values(data);
}

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});