# AWS Textract Setup Instructions

## What You Need

Your `.env.local` file should now include these AWS credentials:

```env
# Existing Supabase credentials
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# NEW: AWS Credentials for Textract
AWS_ACCESS_KEY_ID=your_aws_access_key_here
AWS_SECRET_ACCESS_KEY=your_aws_secret_key_here
AWS_REGION=region_here
AWS_S3_BUCKET=bucket_name_here
```

## Installation Steps

### 1. Install AWS SDK Packages

```bash
npm install @aws-sdk/client-s3 @aws-sdk/client-textract
```

### 2. Add AWS Credentials to .env.local

Open your `.env.local` file and add the 4 new AWS environment variables above.

### 3. Replace Files

Replace these files in your project:

- `lib/textract-extractor.ts` (NEW - replaces pdf-extractor.ts)
- `app/api/patents/upload/route.ts` (UPDATED - now imports textract-extractor)

### 4. Delete Old PDF Extractor (Optional)

You can delete `lib/pdf-extractor.ts` - we're not using it anymore.

### 5. Restart Development Server

```bash
# Stop the server (Ctrl+C)
npm run dev
```

### 6. Test Upload

Go to: http://localhost:3000/test-upload

Upload a patent PDF and watch the magic happen!

## How It Works

1. **User uploads PDF** → Your Next.js API
2. **Upload to S3** → Temporary storage in your S3 bucket
3. **Textract analyzes** → AWS extracts text with page numbers
4. **Claude analyzes** → Identifies claims and elements
5. **Save to Supabase** → Stores everything with page references
6. **Cleanup S3** → Deletes temporary file

## What You'll See

In your terminal, you'll see:
```
📤 Uploading PDF to S3...
🔍 Running Textract analysis...
📄 Processing Textract results...
✅ Extracted 20 pages successfully
🗑️  Cleaning up S3...
✅ Cleanup complete
```

## Free Tier Limits

- **Textract**: 1,000 pages/month for first 3 months (then $1.50 per 1,000 pages)
- **S3**: Basically free for this use case (temp storage, immediate delete)

## Security Notes

⚠️ **NEVER commit `.env.local` to Git!**

Your `.gitignore` should include:
```
.env.local
.env*.local
```

## Troubleshooting

### "Access Denied" Error
- Check your AWS credentials are correct
- Verify the IAM user has `AmazonS3FullAccess` and `AmazonTextractFullAccess` policies

### "Bucket not found" Error
- Verify bucket name is exactly as shown in AWS
- Check you're using the correct region

### "Region mismatch" Error
- Make sure your S3 bucket region matches
