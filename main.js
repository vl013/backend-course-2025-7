#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const http = require("http");
const express = require("express");
const multer = require("multer");
const swaggerUi = require("swagger-ui-express");
const { Command } = require("commander");


// 1. ПАРАМЕТРИ КОМАНДНОГО РЯДКА

const program = new Command();

program
  .requiredOption("-h, --host <host>", "server host")
  .requiredOption("-p, --port <port>", "server port", (v) => parseInt(v))
  .requiredOption("-c, --cache <dir>", "cache directory");

program.parse(process.argv);
const options = program.opts();

const HOST = options.host;
const PORT = options.port;
const CACHE_DIR = path.resolve(options.cache);

// створити cache директорію, якщо нема
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  console.log("Cache folder created:", CACHE_DIR);
}


// 2. ЗБЕРІГАННЯ ДАНИХ ІНВЕНТАРЮ

let nextId = 1;
const inventory = [];

function findItem(id) {
  return inventory.find((x) => x.id === id);
}


// 3. EXPRESS

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// HTML форми
app.use(express.static(path.join(__dirname, "public")));

// Фото
app.use("/images", express.static(CACHE_DIR));


// 4. MULTER ДЛЯ ФОТО

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, CACHE_DIR),
  filename: (req, file, cb) => {
    const name = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname) || ".jpg";-
    cb(null, name + ext);
  },
});
const upload = multer({ storage });


// 5. SWAGGER

const swaggerDocument = {
  openapi: "3.0.0",
  info: { title: "Inventory Service", version: "1.0.0" },
  paths: {
    "/register": {
      post: {
        summary: "Register new inventory item",
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                properties: {
                  inventory_name: { type: "string" },
                  description: { type: "string" },
                  photo: { type: "string", format: "binary" }
                }
              }
            }
          }
        },
        responses: {
          201: { description: "Created" },
          400: { description: "Missing name" }
        }
      }
    },

    "/inventory": {
      get: {
        summary: "Get all inventory items",
        responses: { 200: { description: "OK" } }
      }
    },

    "/inventory/{id}": {
      get: {
        summary: "Get item info",
        parameters: [{ name: "id", in: "path", required: true }],
        responses: { 200: {}, 404: {} }
      },
      put: {
        summary: "Update item",
        parameters: [{ name: "id", in: "path", required: true }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { name: { type: "string" }, description: { type: "string" } }
              }
            }
          }
        },
        responses: { 200: {}, 404: {} }
      },
      delete: {
        summary: "Delete item",
        parameters: [{ name: "id", in: "path", required: true }],
        responses: { 200: {}, 404: {} }
      }
    },

    "/inventory/{id}/photo": {
      get: {
        summary: "Get photo",
        parameters: [{ name: "id", in: "path", required: true }],
        responses: { 200: {}, 404: {} }
      },
      put: {
        summary: "Update photo",
        parameters: [{ name: "id", in: "path", required: true }],
        requestBody: {
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                properties: { photo: { type: "string", format: "binary" } }
              }
            }
          }
        },
        responses: { 200: {}, 404: {} }
      }
    },

    "/search": {
      post: {
        summary: "Search device by ID",
        requestBody: {
          required: true,
          content: {
            "application/x-www-form-urlencoded": {
              schema: {
                type: "object",
                properties: {
                  id: { type: "integer" },
                  has_photo: { type: "string" }
                }
              }
            }
          }
        },
        responses: { 200: {}, 404: {} }
      }
    }
  }
};

app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));


// 6. REDIRECT root → /docs

app.get("/", (req, res) => {
  res.redirect("/docs");
});


// 7. ЕНДПОІНТИ ЛАБОРАТОРНОЇ


// POST /register
app.post("/register", upload.single("photo"), (req, res) => {
  const { inventory_name, description } = req.body;

  if (!inventory_name || inventory_name.trim() === "") {
    return res.status(400).json({ error: "inventory_name is required" });
  }

  const newItem = {
    id: nextId++,
    name: inventory_name,
    description: description || "",
    photoFileName: req.file ? req.file.filename : null,
  };
// a ? b : c
  inventory.push(newItem);

  res.status(201).json({
    id: newItem.id,
    name: newItem.name,
    description: newItem.description,
    photoUrl: newItem.photoFileName ? `/inventory/${newItem.id}/photo` : null
  });
});

// GET /inventory
app.get("/inventory", (req, res) => {
  res.status(200).json(
    inventory.map(item => ({
      id: item.id,
      name: item.name,
      description: item.description,
      photoUrl: item.photoFileName ? `/inventory/${item.id}/photo` : null
    }))
  );
});

// GET /inventory/:id
app.get("/inventory/:id", (req, res) => {
  const id = Number(req.params.id);
  const item = findItem(id);

  if (!item) return res.sendStatus(404);

  res.status(200).json({
    id: item.id,
    name: item.name,
    description: item.description,
    photoUrl: item.photoFileName ? `/inventory/${item.id}/photo` : null
  });
});

// PUT /inventory/:id
app.put("/inventory/:id", (req, res) => {
  const id = Number(req.params.id);
  const item = findItem(id);

  if (!item) return res.sendStatus(404);

  if (req.body.name) item.name = req.body.name;
  if (req.body.description) item.description = req.body.description;

  res.status(200).json(item);
});

// GET /inventory/:id/photo
app.get("/inventory/:id/photo", (req, res) => {
  const id = Number(req.params.id);
  const item = findItem(id);

  if (!item || !item.photoFileName) return res.sendStatus(404);

  const filePath = path.join(CACHE_DIR, item.photoFileName);
  if (!fs.existsSync(filePath)) return res.sendStatus(404);

  res.setHeader("Content-Type", "image/jpeg");
  fs.createReadStream(filePath).pipe(res);
});

// PUT /inventory/:id/photo
app.put("/inventory/:id/photo", upload.single("photo"), (req, res) => {
  const id = Number(req.params.id);
  const item = findItem(id);

  if (!item) return res.sendStatus(404);

  if (req.file) item.photoFileName = req.file.filename;

  res.status(200).json(item);
});

// DELETE /inventory/:id
app.delete("/inventory/:id", (req, res) => {
  const id = Number(req.params.id);
  const index = inventory.findIndex(x => x.id === id);

  if (index === -1) return res.sendStatus(404);

  inventory.splice(index, 1);
  res.sendStatus(200);
});

// POST /search
app.post("/search", (req, res) => {
  const id = Number(req.body.id);
  const includePhoto = req.body.has_photo === "on";

  const item = findItem(id);
  if (!item) return res.sendStatus(404);

  let result = `ID: ${item.id}\nName: ${item.name}\nDescription: ${item.description}`;
  if (includePhoto && item.photoFileName) {
    result += `\nPhoto: http://${HOST}:${PORT}/inventory/${item.id}/photo`;
  }

  res.status(200).send(result);
});

// 405 METHOD NOT ALLOWED
app.use((req, res) => {
  res.status(405).send("Method Not Allowed");
});


// 8. HTTP SERVER

const server = http.createServer(app);

server.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}`);
});
