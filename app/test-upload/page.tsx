'use client';

import { useState } from 'react';

export default function PatentUploadTest() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setResult(null);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('patent', file);

      const response = await fetch('/api/patents/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">
          Patent Upload Test
        </h1>

        <div className="bg-white rounded-lg shadow p-6 space-y-6">
          {/* File Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Patent PDF
            </label>
            <input
              type="file"
              accept=".pdf"
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-500
                file:mr-4 file:py-2 file:px-4
                file:rounded-md file:border-0
                file:text-sm file:font-semibold
                file:bg-blue-50 file:text-blue-700
                hover:file:bg-blue-100
                cursor-pointer"
            />
          </div>

          {/* Upload Button */}
          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-md
              hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed
              font-medium transition-colors"
          >
            {uploading ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Analyzing Patent...
              </span>
            ) : (
              'Upload and Analyze'
            )}
          </button>

          {/* Error Display */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <p className="text-red-800 text-sm font-medium">Error</p>
              <p className="text-red-600 text-sm mt-1">{error}</p>
            </div>
          )}

          {/* Success Display */}
          {result && result.success && (
            <div className="bg-green-50 border border-green-200 rounded-md p-4 space-y-3">
              <p className="text-green-800 font-medium">✅ Patent Analyzed Successfully!</p>
              
              <div className="space-y-2 text-sm">
                <div>
                  <span className="font-medium">Patent Number:</span>{' '}
                  <span className="text-gray-700">{result.patent.patent_number}</span>
                </div>
                <div>
                  <span className="font-medium">Title:</span>{' '}
                  <span className="text-gray-700">{result.patent.title}</span>
                </div>
                <div>
                  <span className="font-medium">Total Pages:</span>{' '}
                  <span className="text-gray-700">{result.patent.total_pages}</span>
                </div>
                <div>
                  <span className="font-medium">Claims Found:</span>{' '}
                  <span className="text-gray-700">{result.patent.claims_count}</span>
                </div>
              </div>

              <a
                href={result.patent.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-2 text-blue-600 hover:text-blue-700 text-sm font-medium"
              >
                View PDF →
              </a>
            </div>
          )}
        </div>

        {/* Instructions */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-md p-4">
          <h2 className="text-sm font-medium text-blue-900 mb-2">How it works:</h2>
          <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
            <li>Upload a patent PDF file</li>
            <li>Text is extracted with page numbers</li>
            <li>Claude analyzes claims and elements</li>
            <li>Data is saved with page references</li>
            <li>You can click through to exact pages later</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
