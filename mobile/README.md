# The Bazaar mobile app

One app for Android and iOS, built with Expo (React Native and TypeScript). Everyone signs in on the same screen with their email, and the app opens the part that fits their account:

- **Riders**: shift switch, a map with their own position, yellow pins for jobs waiting, red for the run they are on, green for today's drops, a line through the stops in the order the orders came in, batching of nearby jobs (jobs that can't join the current run are greyed out with the reason), customer phone and note, "I've arrived", payment check by M-Pesa code or payer name, the 6-digit handover code, earnings and delivery count. Location is shared in the background only while on shift.
- **Shoppers**: browse and search, product photos and video, a wishlist kept apart from the cart, ticking which cart lines to buy now, drop-off pin from the phone's location, pay on arrival to The Bazaar's till, live tracking with the rider on the map.
- **Stores**: orders (payment status is read only, payments are checked centrally), stock counts, product photos and video, the read-only ledger with only their own figures, and their own editable entries that the admin confirms.
- **Admins**: live map and 30-day numbers, rider hiring and payouts, the payments tool that reads pasted M-Pesa and bank messages into the databank, every store's ledger, confirming store entries, paying stores once the books balance, and every price, fee, radius and till number.

The app only talks to the API. It never decides a price, a fee or who may see what; the server does.

## Layout

```
src/app/            screens (Expo Router: each file is a route)
  login.tsx         one sign in for every role
  rider/ shop/ vendor/ admin/
src/api/            generated types (schema.d.ts) and typed calls (client.ts, market.ts)
src/features/       pieces shared by several screens
src/map/            RouteMap: MapLibre on phones, maplibre-gl in the web preview
src/lib/            config, auth, secure storage, websocket, background location, pinning
src/theme.ts        colours and sizes, the same tokens as the web app
```

## Setting up

```bash
cd mobile
npm install
cp .env.example .env     # then fill it in
```

`.env` holds public values only (API domain, Supabase URL and anon key, map tiles). Anything in an `EXPO_PUBLIC_` variable is built into the app, so a secret must never go there.

When the backend's API changes, refresh the types:

```bash
npm run gen:api          # reads ../backend/openapi.json
npm run typecheck
```

## Running it

The app uses native modules (maps, background location, secure storage), so it runs in a development build rather than Expo Go.

```bash
npm run android          # builds and installs a dev build on a connected phone or emulator
npm run ios              # same on a Mac with Xcode
npm start                # starts the bundler for an installed dev build
npm run web              # browser preview, handy for checking screens
```

## Building for the stores

Builds are made with EAS. Sign in once with `npx eas-cli login`, then:

```bash
npx eas-cli build --platform android --profile preview      # APK to install directly on riders' phones
npx eas-cli build --platform android --profile production   # AAB for Google Play
npx eas-cli build --platform ios --profile production       # for TestFlight and the App Store
npx eas-cli submit --platform android|ios                   # upload the last build
```

Set the same `EXPO_PUBLIC_` values for the build, either in `eas.json` under each profile's `env`, or as EAS environment variables. Change `com.thebazaar.app` in `app.json` to your own bundle id before the first store upload.

Local builds work too (`npx expo prebuild` then Android Studio or Xcode); the `android/` and `ios/` folders are generated and not kept in git.

Google Play asks for a short video and a reason when an app uses background location. The reason is in `app.json`: riders share their location only while on shift so customers and the dispatch desk can follow deliveries.

## Security notes

- Sign-in tokens live in the iOS Keychain and Android Keystore (expo-secure-store), readable only while the phone is unlocked and not copied into backups. Android app backup is switched off.
- Every request carries the Supabase access token; a 401 signs the phone out. Roles are checked on the server for every call, the app's role switch only picks screens.
- Release builds refuse a plain-http API address and Android blocks cleartext traffic.
- Public key pinning for the API host is built in and stays off until `EXPO_PUBLIC_API_PINS` holds at least two SHA-256 SPKI hashes (the live key and a backup). Get a hash with:
  `openssl s_client -connect shop.example.com:443 -servername shop.example.com </dev/null | openssl x509 -pubkey -noout | openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | base64`
  Caddy renews certificates on its own; keep its key stable (or pin your CA's intermediate) before turning this on, or riders get locked out at renewal.
- The websocket sends the token in its first message, not the URL.

## Maps

Tiles come from `EXPO_PUBLIC_MAP_TILES`, OpenStreetMap's own servers by default. Their usage policy is fine for testing but not for a fleet, so point it at a tile provider or your own tile server before launch. Route lines follow roads when `EXPO_PUBLIC_ROUTING_URL` points at an OSRM server (it runs well as a container next to the API); without it the map draws straight lines between stops. The Directions button hands the whole run to Google Maps for turn-by-turn.
