'use client';

import { useState } from 'react';

interface ProductUrl {
  id: string;
  url: string;
  description: string;
}

interface Company {
  id: string;
  name: string;
  aliases: string;
  websiteUrl: string;
  patentNumbers: string;
  productUrls: ProductUrl[];
}

export default function AddCompetitorsPage() {
  const [companies, setCompanies] = useState<Company[]>([
    {
      id: '1',
      name: '',
      aliases: '',
      websiteUrl: '',
      patentNumbers: '',
      productUrls: [{ id: '1', url: '', description: '' }],
    },
  ]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  // Company management
  const addCompany = () => {
    setCompanies([
      ...companies,
      {
        id: Date.now().toString(),
        name: '',
        aliases: '',
        websiteUrl: '',
        patentNumbers: '',
        productUrls: [{ id: '1', url: '', description: '' }],
      },
    ]);
  };

  const removeCompany = (id: string) => {
    setCompanies(companies.filter(c => c.id !== id));
  };

  const updateCompany = (id: string, field: keyof Company, value: string) => {
    setCompanies(
      companies.map(c =>
        c.id === id ? { ...c, [field]: value } : c
      )
    );
  };

  // Product URL management
  const addProductUrl = (companyId: string) => {
    setCompanies(
      companies.map(c =>
        c.id === companyId
          ? {
              ...c,
              productUrls: [
                ...c.productUrls,
                { id: Date.now().toString(), url: '', description: '' },
              ],
            }
          : c
      )
    );
  };

  const removeProductUrl = (companyId: string, urlId: string) => {
    setCompanies(
      companies.map(c =>
        c.id === companyId
          ? {
              ...c,
              productUrls: c.productUrls.filter(p => p.id !== urlId),
            }
          : c
      )
    );
  };

  const updateProductUrl = (
    companyId: string,
    urlId: string,
    field: 'url' | 'description',
    value: string
  ) => {
    setCompanies(
      companies.map(c =>
        c.id === companyId
          ? {
              ...c,
              productUrls: c.productUrls.map(p =>
                p.id === urlId ? { ...p, [field]: value } : p
              ),
            }
          : c
      )
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setResult(null);

    try {
      // Format data for API
      const competitorsData = companies
        .filter(c => c.name.trim())
        .map(c => ({
          companyName: c.name.trim(),
          aliases: c.aliases.split(',').map(a => a.trim()).filter(Boolean),
          websiteUrl: c.websiteUrl.trim() || null,
          patentNumbers: c.patentNumbers.split(',').map(p => p.trim()).filter(Boolean),
          productUrls: c.productUrls.filter(p => p.url.trim()),
        }));

      if (competitorsData.length === 0) {
        throw new Error('Please add at least one company');
      }

      const response = await fetch('/api/competitors/research-batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ competitors: competitorsData }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to research competitors');
      }

      const data = await response.json();
      setResult(data);

      // Reset form on success
      setCompanies([
        {
          id: '1',
          name: '',
          aliases: '',
          websiteUrl: '',
          patentNumbers: '',
          productUrls: [{ id: '1', url: '', description: '' }],
        },
      ]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="bg-white rounded-lg shadow-md p-8">
          <div className="flex justify-between items-start mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                Batch Competitor Research
              </h1>
              <p className="text-gray-600">
                Add multiple competitors at once for automated patent and product research
              </p>
            </div>
            <button
              type="button"
              onClick={addCompany}
              className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 font-medium"
            >
              + Add Company
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Companies List */}
            {companies.map((company, companyIndex) => (
              <div
                key={company.id}
                className="border-2 border-gray-200 rounded-lg p-6 relative"
              >
                {/* Company Header */}
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-xl font-semibold text-gray-800">
                    Company {companyIndex + 1}
                  </h3>
                  {companies.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeCompany(company.id)}
                      className="text-red-600 hover:text-red-800 font-medium"
                    >
                      Remove Company
                    </button>
                  )}
                </div>

                <div className="space-y-4">
                  {/* Company Name */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Company Name *
                    </label>
                    <input
                      type="text"
                      value={company.name}
                      onChange={(e) => updateCompany(company.id, 'name', e.target.value)}
                      placeholder="e.g., Apple Inc."
                      required
                      className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  {/* Company Aliases */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Company Aliases (Optional)
                    </label>
                    <input
                      type="text"
                      value={company.aliases}
                      onChange={(e) => updateCompany(company.id, 'aliases', e.target.value)}
                      placeholder="e.g., Apple Computer Inc., Apple Computer, AAPL (comma-separated)"
                      className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <p className="text-sm text-gray-500 mt-1">
                      Other names this company might file patents under
                    </p>
                  </div>

                  {/* Company Website */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Company Website (For Product Discovery)
                    </label>
                    <input
                      type="url"
                      value={company.websiteUrl}
                      onChange={(e) => updateCompany(company.id, 'websiteUrl', e.target.value)}
                      placeholder="https://www.example.com"
                      className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <p className="text-sm text-gray-500 mt-1">
                      We'll automatically discover product pages and documentation
                    </p>
                  </div>

                  {/* Known Patents */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Known Patent Numbers (Optional)
                    </label>
                    <input
                      type="text"
                      value={company.patentNumbers}
                      onChange={(e) =>
                        updateCompany(company.id, 'patentNumbers', e.target.value)
                      }
                      placeholder="e.g., US-20230059806-A1, US-11234567-B2 (comma-separated)"
                      className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <p className="text-sm text-gray-500 mt-1">
                      Leave blank to search USPTO automatically
                    </p>
                  </div>

                  {/* Specific Product URLs */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Specific Product Documentation URLs (Optional)
                    </label>

                    {company.productUrls.map((product, index) => (
                      <div key={product.id} className="mb-3 p-4 bg-gray-50 rounded-md">
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-sm font-medium text-gray-600">
                            URL {index + 1}
                          </span>
                          {company.productUrls.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeProductUrl(company.id, product.id)}
                              className="text-red-600 hover:text-red-800 text-sm"
                            >
                              Remove
                            </button>
                          )}
                        </div>

                        <input
                          type="url"
                          value={product.url}
                          onChange={(e) =>
                            updateProductUrl(company.id, product.id, 'url', e.target.value)
                          }
                          placeholder="https://example.com/product-specs.pdf"
                          className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-2"
                        />

                        <input
                          type="text"
                          value={product.description}
                          onChange={(e) =>
                            updateProductUrl(company.id, product.id, 'description', e.target.value)
                          }
                          placeholder="Description (e.g., iPhone 15 Pro Technical Specs)"
                          className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                    ))}

                    <button
                      type="button"
                      onClick={() => addProductUrl(company.id)}
                      className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                    >
                      + Add Product URL
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {/* Error Display */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-md p-4">
                <p className="text-red-800 text-sm">
                  <strong>Error:</strong> {error}
                </p>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-3 px-6 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium transition-colors text-lg"
            >
              {loading ? (
                <>
                  <span className="inline-block animate-spin mr-2">⏳</span>
                  Researching {companies.filter(c => c.name).length} Companies...
                </>
              ) : (
                `Research ${companies.filter(c => c.name).length} ${
                  companies.filter(c => c.name).length === 1 ? 'Company' : 'Companies'
                }`
              )}
            </button>
          </form>

          {/* Success Result */}
          {result && (
            <div className="mt-8 bg-green-50 border border-green-200 rounded-md p-6">
              <h2 className="text-lg font-semibold text-green-900 mb-4">
                ✅ Batch Research Complete!
              </h2>

              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div className="bg-white p-4 rounded-md">
                    <div className="text-gray-600">Companies Processed</div>
                    <div className="text-2xl font-bold text-gray-900">
                      {result.companiesProcessed}
                    </div>
                  </div>
                  <div className="bg-white p-4 rounded-md">
                    <div className="text-gray-600">Documents Found</div>
                    <div className="text-2xl font-bold text-gray-900">
                      {result.totalDocuments}
                    </div>
                  </div>
                  <div className="bg-white p-4 rounded-md">
                    <div className="text-gray-600">Pages Extracted</div>
                    <div className="text-2xl font-bold text-gray-900">
                      {result.totalPages}
                    </div>
                  </div>
                </div>

                {result.competitors && result.competitors.length > 0 && (
                  <div className="border-t border-green-300 pt-4">
                    <h3 className="font-medium text-green-900 mb-2">Companies Added:</h3>
                    <ul className="space-y-1">
                      {result.competitors.map((comp: any) => (
                        <li key={comp.id} className="text-sm text-green-800">
                          • {comp.name} ({comp.documentsFound} documents)
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="pt-3 border-t border-green-300">
                  <a
                    href="/competitors"
                    className="text-blue-600 hover:text-blue-800 font-medium"
                  >
                    View All Competitors →
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Help Section */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-md p-6">
          <h3 className="font-semibold text-blue-900 mb-3">💡 How Batch Research Works</h3>
          <div className="text-sm text-blue-800 space-y-3">
            <div>
              <strong>1. Automatic Patent Discovery:</strong>
              <ul className="ml-4 mt-1 space-y-1">
                <li>• Searches USPTO by company name AND all aliases</li>
                <li>• Finds all patents filed under any variation of the name</li>
                <li>• Extracts full patent text with page references</li>
              </ul>
            </div>
            <div>
              <strong>2. Product Documentation Discovery:</strong>
              <ul className="ml-4 mt-1 space-y-1">
                <li>• Crawls company website for product pages</li>
                <li>• Finds technical specs, whitepapers, datasheets</li>
                <li>• Extracts features and claims from documentation</li>
              </ul>
            </div>
            <div>
              <strong>3. Specific URLs (Optional):</strong>
              <ul className="ml-4 mt-1 space-y-1">
                <li>• Add direct links to specific documents you want analyzed</li>
                <li>• Useful for competitor patents you already know about</li>
                <li>• Supports PDFs and web pages</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
