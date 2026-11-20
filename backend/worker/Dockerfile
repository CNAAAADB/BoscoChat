FROM public.ecr.aws/lambda/nodejs:22
RUN dnf install -y poppler-utils python3 python3-pip && dnf clean all
RUN python3 -m pip install --no-cache-dir boto3==1.40.65
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src/ ./src/
COPY worker/ ./worker/
CMD ["worker/handler.handler"]
