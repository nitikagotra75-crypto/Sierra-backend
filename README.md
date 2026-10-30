# Sierra Backend

REST API for **Sierra**, an AI-assisted backend builder. It takes a user's prompt, asks Claude (Anthropic API) to generate backend code, stores the project in MongoDB, and can build and run the generated project in an isolated Docker container.

Frontend repo: https://github.com/nitikagotra75-crypto/Sierra-frontend

## Features

- Generate backend project files from a natural-language prompt using Claude
- Save and retrieve projects with MongoDB (Mongoose)
- Build a Docker image from generated files and run it on a free port
- CORS-enabled REST API consumed by the React frontend
- `run_demo.js` to test the pipeline without the UI

## Tech Stack

| Purpose | Package |
|---|---|
| Server | Node.js, Express 4 |
| AI | `@anthropic-ai/sdk` |
| Database | `mongoose` (`mongodb-memory-server` for dev/testing) |
| Containers | `dockerode`, `tar-fs`, `get-port` |
| Utilities | `cors`, `dotenv`, `uuid` |

## Project Structure

```
Sierra-backend/
├── src/            # Server entry (index.js), routes, services, models
├── run_demo.js     # Demo script for the generate -> run flow
├── package.json
└── .gitignore
```

## How It Works

```
Request -> Express route -> Claude generates files -> Save in MongoDB
        -> (on Run) tar files -> Docker build -> start container on free port -> return URL
```

1. **Receive prompt:** the frontend sends a JSON request.
2. **Generate:** the backend calls the Anthropic API and parses the returned files.
3. **Store:** the project is saved with a `uuid` id in MongoDB.
4. **Run:** files are packed with `tar-fs`, built into an image with `dockerode`, and started on a port found by `get-port`.
5. **Respond:** the API returns project data, status, and the running container's port/URL.

## Getting Started

### Prerequisites
- Node.js 18+
- Docker running locally
- MongoDB (local or Atlas)
- Anthropic API key

### Install
```bash
git clone https://github.com/nitikagotra75-crypto/Sierra-backend.git
cd Sierra-backend
npm install
```

### Environment variables
Create a `.env` file:
```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/sierra
ANTHROPIC_API_KEY=your_api_key
CLIENT_URL=http://localhost:5173
```

### Run
```bash
npm run dev     # or: npm start
```
Server starts at `http://localhost:5000`.

### Demo
```bash
node run_demo.js
```

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/projects/generate` | Generate project code from a prompt |
| GET | `/api/projects` | List projects |
| GET | `/api/projects/:id` | Get a project and its files |
| PUT | `/api/projects/:id` | Update project files |
| POST | `/api/projects/:id/run` | Build and run in Docker |
| POST | `/api/projects/:id/stop` | Stop the container |

Example:
```bash
curl -X POST http://localhost:5000/api/projects/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Todo API with CRUD and MongoDB"}'
```

## Connecting With the Frontend

- The frontend calls this API using the URL in its `VITE_API_URL`.
- `CLIENT_URL` here must match the frontend origin so CORS allows the requests.
- Both must be running at the same time (backend 5000, frontend 5173 by default).

## Security Notes

- Never commit `.env` or API keys.
- Run generated code in Docker with CPU/memory limits; never expose the Docker socket publicly.
- Restrict CORS to your real frontend domain in production.

## Scripts

| Script | Description |
|---|---|
| `npm start` | Start the server |
| `npm run dev` | Start the server (dev) |

## Author

Nitika Gotra - [@nitikagotra75-crypto](https://github.com/nitikagotra75-crypto)
