# The sandbox image: one image for every learner repo, whatever the project.
# JDK 21 with Maven (Gradle projects use their own wrapper), Python 3.12, Node.js 22, git, coreutils (the real wc), bc.
# Locally: npm run sandbox:image. On Daytona the same file becomes the snapshot.
FROM eclipse-temurin:21-jdk-noble

ENV DEBIAN_FRONTEND=noninteractive \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8 \
    PIP_BREAK_SYSTEM_PACKAGES=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    MAVEN_OPTS="-Dmaven.repo.local=/opt/m2"

RUN apt-get update \
 && apt-get install -y --no-install-recommends git unzip curl ca-certificates xz-utils bc python3 python3-pip python3-venv maven \
 && curl -fsSL https://nodejs.org/dist/v22.12.0/node-v22.12.0-linux-x64.tar.xz | tar -xJ -C /usr/local --strip-components=1 \
 && ln -sf /usr/bin/python3 /usr/local/bin/python \
 && rm -rf /var/lib/apt/lists/*

# runner.py is uploaded with every review, so changing it never needs a new image.
WORKDIR /work
