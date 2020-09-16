FROM node:lts-slim

# Install App Here
RUN apt-get update && DEBIAN_FRONTEND=noninteractive \
  apt-get install -y \
  ffmpeg

RUN ffmpeg -version
