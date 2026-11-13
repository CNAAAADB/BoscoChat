FROM public.ecr.aws/lambda/nodejs:22
RUN dnf install -y poppler-utils && dnf clean all
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src/ ./src/
COPY worker/ ./worker/
CMD ["worker/handler.handler"]
