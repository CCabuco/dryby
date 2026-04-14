# DryBy Admin Site

This folder is a standalone admin website for the same Firebase project used by the main DryBy app.

## Local preview

Open [index.html](C:/Users/rashe/Documents/GitHub/dryby/MyApp( admin & loc)/admin-site/index.html) in a browser, or serve the folder with any static server.

## Firebase Hosting setup

The repo is configured for two separate Hosting targets:

- `dryby-fi` for the main Expo web app build in `dist`
- `admin` for this standalone admin site in `admin-site`

Create a second Hosting site in Firebase Console first, then map it once in the CLI:

```powershell
firebase target:apply hosting admin YOUR_ADMIN_SITE_ID
```

Examples of site IDs:

- `dryby-admin`
- `admin-dryby-fi`

After the target is mapped, deploy the admin site with:

```powershell
npm run hosting:deploy:admin
```

Deploy the main web app with:

```powershell
npm run hosting:deploy:web
```

## Access rules

The admin site accepts accounts whose Firestore `users/{uid}` document has:

- `role: "admin"`
- `role: "super-admin"`

Only `super-admin` can promote other users to `admin`.
