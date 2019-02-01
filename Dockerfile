FROM node:11-alpine
# Create app directory
RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

COPY . /usr/src/app/
# Install app dependencies
RUN npm install

EXPOSE 80
CMD [ "npm", "start" ]
