// Package framework detects the framework of a local app folder and emits a
// reasonable Dockerfile if the project doesn't already ship one.
package framework

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

type Kind string

const (
	KindStreamlit Kind = "streamlit"
	KindFastAPI   Kind = "fastapi"
	KindFlask     Kind = "flask"
	KindNext      Kind = "nextjs"
	KindVite      Kind = "vite"
	KindNode      Kind = "node"
	KindPython    Kind = "python"
	KindStatic    Kind = "static"
	KindUnknown   Kind = "unknown"
)

type Detected struct {
	Kind        Kind
	Port        int
	Entrypoint  string
	HasDocker   bool
	DockerPath  string
}

// Detect inspects path and returns the most likely framework along with a
// suggested port and entrypoint.
func Detect(path string) (Detected, error) {
	d := Detected{Kind: KindUnknown, Port: 8080}

	if hasFile(path, "Dockerfile") {
		d.HasDocker = true
		d.DockerPath = filepath.Join(path, "Dockerfile")
	}

	switch {
	case hasAny(path, "streamlit_app.py", "app.py") && containsAny(path, "requirements.txt", "streamlit"):
		d.Kind = KindStreamlit
		d.Port = 8501
		d.Entrypoint = pickFirst(path, "streamlit_app.py", "app.py", "main.py")
	case fileGrep(filepath.Join(path, "requirements.txt"), "fastapi"):
		d.Kind = KindFastAPI
		d.Port = 8000
		d.Entrypoint = pickFirst(path, "main.py", "app.py")
	case fileGrep(filepath.Join(path, "requirements.txt"), "flask"):
		d.Kind = KindFlask
		d.Port = 5000
		d.Entrypoint = pickFirst(path, "app.py", "main.py")
	case hasFile(path, "next.config.js") || hasFile(path, "next.config.mjs") || hasFile(path, "next.config.ts"):
		d.Kind = KindNext
		d.Port = 3000
	case fileGrep(filepath.Join(path, "package.json"), "\"vite\""):
		d.Kind = KindVite
		d.Port = 5173
	case hasFile(path, "package.json"):
		d.Kind = KindNode
		d.Port = 3000
	case hasFile(path, "requirements.txt") || hasFile(path, "pyproject.toml"):
		d.Kind = KindPython
		d.Port = 8000
		d.Entrypoint = pickFirst(path, "main.py", "app.py")
	case hasFile(path, "index.html"):
		d.Kind = KindStatic
		d.Port = 80
	}

	return d, nil
}

// Dockerfile returns a generated Dockerfile body for the detected framework.
// If the project already has a Dockerfile, callers should prefer that.
func (d Detected) Dockerfile() (string, error) {
	switch d.Kind {
	case KindStreamlit:
		entry := d.Entrypoint
		if entry == "" {
			entry = "app.py"
		}
		return fmt.Sprintf(`FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8501
CMD ["streamlit", "run", "%s", "--server.port=8501", "--server.address=0.0.0.0", "--server.headless=true"]
`, entry), nil
	case KindFastAPI:
		entry := strings.TrimSuffix(d.Entrypoint, ".py")
		if entry == "" {
			entry = "main"
		}
		return fmt.Sprintf(`FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["uvicorn", "%s:app", "--host", "0.0.0.0", "--port", "8000"]
`, entry), nil
	case KindFlask:
		entry := d.Entrypoint
		if entry == "" {
			entry = "app.py"
		}
		return fmt.Sprintf(`FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 5000
ENV FLASK_APP=%s
CMD ["flask", "run", "--host=0.0.0.0", "--port=5000"]
`, entry), nil
	case KindNext:
		return `FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci || npm install
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
`, nil
	case KindVite:
		return `FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci || npm install
COPY . .
RUN npm run build
RUN npm install -g serve
EXPOSE 5173
CMD ["serve", "-s", "dist", "-l", "5173"]
`, nil
	case KindNode:
		return `FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci || npm install
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
`, nil
	case KindPython:
		entry := d.Entrypoint
		if entry == "" {
			entry = "main.py"
		}
		return fmt.Sprintf(`FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["python", "%s"]
`, entry), nil
	case KindStatic:
		return `FROM nginx:alpine
COPY . /usr/share/nginx/html
EXPOSE 80
`, nil
	}
	return "", fmt.Errorf("unsupported framework %q — please add a Dockerfile to %s", d.Kind, "the project")
}

func hasFile(dir, name string) bool {
	_, err := os.Stat(filepath.Join(dir, name))
	return err == nil
}

func hasAny(dir string, names ...string) bool {
	for _, n := range names {
		if hasFile(dir, n) {
			return true
		}
	}
	return false
}

func pickFirst(dir string, names ...string) string {
	for _, n := range names {
		if hasFile(dir, n) {
			return n
		}
	}
	return ""
}

func containsAny(dir string, files ...string) bool {
	for _, f := range files {
		if hasFile(dir, f) {
			return true
		}
	}
	return false
}

func fileGrep(path, needle string) bool {
	b, err := os.ReadFile(path)
	if err != nil {
		return false
	}
	return strings.Contains(strings.ToLower(string(b)), strings.ToLower(needle))
}
