# Trouverunmarchand.com

Site web pour trouver, sur une carte et par géolocalisation, des marchands ambulants selon leur catégorie et le jour de la semaine.

**Stack** : Node.js 20+ · Express · EJS · SQLite (better-sqlite3) · Leaflet + OpenStreetMap · Nominatim (géocodage).

## Lancer en local

```bash
npm install
cp .env.example .env   # optionnel : les variables peuvent aussi être exportées dans le shell
npm start              # http://localhost:3000 (le fichier .env est lu automatiquement)
npm test               # tests unitaires (regroupement par lieu, CSRF, .env…)
```

En développement (sans `ADMIN_EMAIL`), un compte admin par défaut est créé : `admin@example.com` / `admin1234`.
En production, définissez `ADMIN_EMAIL` et `ADMIN_PASSWORD`.

## Fonctionnalités

- **Carte** : au clic sur un marqueur, mini fiche (photo, nom, catégorie, horaires, adresse courte, bouton « Y aller », lien vers la fiche complète). Marqueurs en goutte inversée avec l'icône (emoji) et la couleur de la catégorie ; au même endroit, un seul marqueur avec le **nombre de marchands distincts** (plusieurs sessions d'un même marchand = 1). Filtres : jour (par défaut aujourd'hui), catégories, distance (par défaut 10 km autour de la position du visiteur), recherche d'une ville.
- **Espace marchand** : inscription, connexion, mot de passe oublié (lien par e-mail), profil, photo, contact affiché ou non, sessions de vente avec **vérification de l'adresse** et aperçu/ajustement du repère sur une carte avant validation, suppression du compte.
- **Fiche marchand** `/marchand/<slug>` : uniquement les informations choisies par le marchand ; version imprimable A4 avec bannière du site et **QR code** vers la fiche (`/marchand/<slug>/imprimer`).
- **Admin** `/admin` : catégories (nom, icône, couleur) et marchands (création, modification, sessions, suppression).
- **Soutien** `/soutenir` : paiement via Stripe Checkout (actif si `STRIPE_SECRET_KEY` est défini).

## Déployer sur Render

1. Poussez ce dossier sur un dépôt GitHub.
2. Sur Render : **New → Blueprint**, choisissez le dépôt (le fichier `render.yaml` est détecté).
3. Renseignez `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `BASE_URL`, et idéalement les variables SMTP et `STRIPE_SECRET_KEY`.

⚠️ La base SQLite et les photos sont stockées sur un **disque persistant** (`/var/data`), qui nécessite une instance payante (plan *Starter*). Sur une instance gratuite, les données seraient perdues à chaque redéploiement.

## Notes

- Le géocodage utilise le service public Nominatim (1 requête/seconde, usage raisonnable). Pour un fort trafic, passez à un fournisseur dédié (changer `lib/geocode.js`).
- Sans SMTP configuré, les e-mails (réinitialisation) sont affichés dans les logs du serveur.
- Les cookies de session sont `SameSite=Lax` et `HttpOnly`.
- Sécurité : jeton CSRF sur tous les formulaires, mots de passe hachés (bcrypt), limitation de débit sur la connexion et le géocodage, nouvelle session à la connexion.
- La fiche imprimable tient toujours sur une page A4 (photo compressible, horaires sur 2 colonnes, réduction d'échelle automatique) : le QR code n'est jamais coupé.
- Avant la mise en ligne : ajoutez des mentions légales et une politique de confidentialité (RGPD) ; le site stocke des données personnelles de marchands.
- Après le premier `npm install`, commitez le `package-lock.json` généré.

## Organisation des fichiers

Tous les fichiers sont à la racine (aucun sous-dossier) :
- `server.js` : application Express ; `route-*.js` : routes ; `db.js`, `util.js`, `mail.js`, `geocode.js`, `places.js`, `csrf.js`, `env.js` : modules.
- `*.ejs` : pages (`admin-*.ejs` pour l'administration, `head.ejs`/`foot.ejs`/`footer.ejs` : parties communes).
- `style.css`, `print.css`, `client-*.js` : fichiers du navigateur. Ils sont servis via une liste blanche dans `server.js` (URL `/css/…` et `/js/…`) : si vous ajoutez un fichier côté navigateur, ajoutez-le à `ASSETS`.
- `lib.test.js` : tests (`npm test`).

## Données de démonstration (région bordelaise)

`npm run seed:demo` crée 30 marchands **fictifs** (2 à 4 sessions chacun, sur de vraies places et centres-villes de Bordeaux et de sa région) ; relancer la commande les recrée sans doublon. `npm run seed:demo:remove` les supprime. Les comptes sont `demo01@demo.trouverunmarchand.test` … `demo30@…` avec le mot de passe `demo1234`, et les téléphones utilisent les plages fictives de l'ARCEP. Ne lancez pas cette commande sur la base de production réelle, ou supprimez-les ensuite (aussi possible depuis l'espace admin).

## Signalement d'absence et suspension des sessions

**Signalement par un client.** Dans la mini fiche d'un marqueur, un lien « Il n'est pas à son emplacement ? » apparaît **uniquement pendant les horaires de la session** (le serveur revérifie, fuseau `APP_TIMEZONE`). Le client peut ajouter une précision ; aucune donnée personnelle n'est demandée (seule une empreinte de l'IP est conservée, pour limiter les abus). Alors :
- le marchand reçoit un **e-mail** (adresse de son compte) rappelant qu'il peut suspendre ses sessions ;
- le marchand reçoit un **message WhatsApp** s'il a coché « Me prévenir par WhatsApp » dans son profil (consentement exigé par WhatsApp) et que WhatsApp est configuré ;
- les **administrateurs** reçoivent un e-mail ; la liste est dans `/admin/signalements` (marquer « traité »).

Anti-abus : champ piège contre les robots, 10 signalements par heure et par IP, un seul signalement par client et par session toutes les 6 h, et le marchand n'est pas ré-alerté pour la même session plus d'une fois toutes les 4 h. Les e-mails utilisent la configuration SMTP ; sans SMTP ils apparaissent dans les logs.

**Configurer WhatsApp (API Cloud de Meta).** WhatsApp n'autorise l'envoi à l'initiative de l'entreprise qu'avec un **modèle de message approuvé** :
1. Créez un compte Meta Business et une application « WhatsApp Business » (developers.facebook.com), puis un numéro d'envoi : notez son *Phone number ID* et créez un jeton d'accès permanent.
2. Dans le gestionnaire WhatsApp, créez un modèle nommé `signalement_absence`, catégorie *Utilitaire*, langue française, avec ce corps :
   `Bonjour, un client signale ne pas avoir trouvé « {{1}} » à l'emplacement prévu : {{2}}. Si vous êtes absent(e), suspendez vos sessions depuis votre espace marchand sur trouverunmarchand.com.`
3. Renseignez `WHATSAPP_TOKEN` et `WHATSAPP_PHONE_ID` (et `WHATSAPP_TEMPLATE` si vous avez choisi un autre nom). L'envoi WhatsApp se facture selon la grille de Meta.
Sans ces variables, seuls les e-mails sont envoyés.

**Suspension des sessions.** Dans « Mes sessions de vente », chaque session a un bouton *Suspendre / Réactiver*, avec *Tout suspendre / Tout réactiver* pour les vacances ou une maladie. Une session suspendue disparaît de la carte, de la fiche publique et de la fiche imprimable, mais reste dans l'espace du marchand. Une session suspendue ne peut pas être signalée.
