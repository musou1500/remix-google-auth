const path = require("path");
const express = require("express");
const compression = require("compression");
const morgan = require("morgan");
const { createRequestHandler } = require("@remix-run/express");
const { PrismaClient } = require("@prisma/client");
const { auth } = require("express-openid-connect");

const BUILD_DIR = path.join(process.cwd(), "build");

const prisma = new PrismaClient();
const app = express();

app.use(compression());

// http://expressjs.com/en/advanced/best-practice-security.html#at-a-minimum-disable-x-powered-by-header
app.disable("x-powered-by");

app.use(auth({ issuerBaseURL: "https://accounts.google.com" }));

app.use(async (req, res, next) => {
  try {
    const oidcUser = req.oidc.user;
    if (!oidcUser) {
      res.sendStatus(401);
      return;
    }

    const { sub: googleAccountId, email, name } = oidcUser;
    const user = await prisma.user.findUnique({
      where: {
        googleAccountId,
      },
    });

    if (user) {
      req.user = user;
      next();
      return;
    }

    req.user = await prisma.user.create({
      data: {
        googleAccountId,
        email,
        name,
      },
    });

    next();
  } catch (e) {
    next(e);
  }
});

// Remix fingerprints its assets so we can cache forever.
app.use(
  "/build",
  express.static("public/build", { immutable: true, maxAge: "1y" })
);

// Everything else (like favicon.ico) is cached for an hour. You may want to be
// more aggressive with this caching.
app.use(express.static("public", { maxAge: "1h" }));

app.use(morgan("tiny"));

const getLoadContext = (req, _res) => {
  return { user: req.user };
};

app.all(
  "*",
  process.env.NODE_ENV === "development"
    ? (req, res, next) => {
        purgeRequireCache();

        return createRequestHandler({
          build: require(BUILD_DIR),
          mode: process.env.NODE_ENV,
          getLoadContext,
        })(req, res, next);
      }
    : createRequestHandler({
        build: require(BUILD_DIR),
        mode: process.env.NODE_ENV,
        getLoadContext,
      })
);

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`Express server listening on port ${port}`);
});

function purgeRequireCache() {
  // purge require cache on requests for "server side HMR" this won't let
  // you have in-memory objects between requests in development,
  // alternatively you can set up nodemon/pm2-dev to restart the server on
  // file changes, but then you'll have to reconnect to databases/etc on each
  // change. We prefer the DX of this, so we've included it for you by default
  for (let key in require.cache) {
    if (key.startsWith(BUILD_DIR)) {
      delete require.cache[key];
    }
  }
}
