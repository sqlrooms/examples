import { useState } from 'react';
import { RoomPanel } from '@sqlrooms/room-shell';
import { TableStructurePanel } from '@sqlrooms/sql-editor';
import { FileDropzone } from '@sqlrooms/dropzone';
import { useRoomStore, RoomPanelTypes } from '../store';
import { convertToValidColumnOrTableName } from '@sqlrooms/utils';
import { useToast, Button, Input } from '@sqlrooms/ui';

export const DataSourcesPanel = () => {
  const connector = useRoomStore((state) => state.db.connector);
  const refreshTableSchemas = useRoomStore((state) => state.db.refreshTableSchemas);
  const { toast } = useToast();

  const [hfId, setHfId] = useState('');
  const [loading, setLoading] = useState(false);

  // Validate Hugging Face dataset ID format
  const validateHfId = (id: string): boolean => {
    const trimmedId = id.trim();
    // Hugging Face dataset IDs should be in format: "org/dataset" or "user/dataset"
    const hfIdPattern = /^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/;
    return hfIdPattern.test(trimmedId);
  };

  const handleHuggingFaceLoad = async () => {
    if (!connector) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Database connector not initialized',
      });
      return;
    }

    const trimmedId = hfId.trim();
    
    // Validate input format
    if (!validateHfId(trimmedId)) {
      toast({
        variant: 'destructive',
        title: 'Invalid Dataset ID',
        description: 'Please enter a valid Hugging Face dataset ID (e.g., "org/dataset")',
      });
      return;
    }

    setLoading(true);
    try {
      const apiUrl = `https://huggingface.co/api/datasets/${trimmedId}/revision/main`;
      const apiResp = await fetch(apiUrl);
      
      if (!apiResp.ok) {
        let errorMessage = `HTTP error! status: ${apiResp.status}`;
        switch (apiResp.status) {
          case 404:
            errorMessage = `Dataset "${trimmedId}" not found on Hugging Face`;
            break;
          case 403:
            errorMessage = `Access denied to dataset "${trimmedId}"`;
            break;
          case 429:
            errorMessage = 'Rate limited by Hugging Face API. Please try again later.';
            break;
        }
        throw new Error(errorMessage);
      }
      
      const apiJson = await apiResp.json();

      // Check if siblings exist
      if (!apiJson.siblings || !Array.isArray(apiJson.siblings)) {
        throw new Error('Invalid dataset structure or dataset not found');
      }

      const supportedFile = apiJson.siblings.find((f: any) =>
        ['.csv', '.json', '.jsonl', '.parquet', '.arrow'].some(ext =>
          f.rfilename?.toLowerCase().endsWith(ext)
        )
      );

      if (!supportedFile) {
        throw new Error('No CSV, JSON, JSONL, Parquet, or Arrow file found in dataset.');
      }

      const fileUrl = `https://huggingface.co/datasets/${trimmedId}/resolve/main/${supportedFile.rfilename}`;
      const fileExt = supportedFile.rfilename.split('.').pop()?.toLowerCase() || '';
      const mimeType =
        fileExt === 'csv' ? 'text/csv' :
        fileExt === 'json' ? 'application/json' :
        fileExt === 'jsonl' ? 'application/jsonl' :
        fileExt === 'parquet' ? 'application/octet-stream' :
        fileExt === 'arrow' ? 'application/vnd.apache.arrow.file' :
        'application/octet-stream';

      const fileResp = await fetch(fileUrl);
      if (!fileResp.ok) {
        throw new Error(`Failed to fetch file: ${fileResp.status}`);
      }

      // Check file size (100MB limit)
      const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
      const contentLength = fileResp.headers.get('content-length');
      if (contentLength && parseInt(contentLength) > MAX_FILE_SIZE) {
        throw new Error(`File too large (${Math.round(parseInt(contentLength) / 1024 / 1024)}MB). Maximum size is 100MB.`);
      }
      
      const blob = await fileResp.blob();
      const file = new File([blob], supportedFile.rfilename, { type: mimeType });

      const tableName = convertToValidColumnOrTableName(file.name);
      
      // Check if loadFile method exists
      if (typeof connector.loadFile === 'function') {
        await connector.loadFile(file, tableName);
      } else {
        throw new Error('Connector does not support loadFile method');
      }

      toast({
        variant: 'default',
        title: 'Dataset loaded',
        description: `Hugging Face dataset ${trimmedId} loaded as ${tableName}`,
      });
      
      await refreshTableSchemas();
      setHfId(''); // Clear input after successful load
    } catch (error: any) {
      console.error('Error loading Hugging Face dataset:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: `Failed to load Hugging Face dataset: ${error.message || error}`,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFileDrop = async (files: File[]) => {
    if (!connector) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Database connector not initialized',
      });
      return;
    }

    for (const file of files) {
      try {
        const tableName = convertToValidColumnOrTableName(file.name);
        
        if (typeof connector.loadFile === 'function') {
          await connector.loadFile(file, tableName);
        } else {
          throw new Error('Connector does not support loadFile method');
        }
        
        toast({
          variant: 'default',
          title: 'Table created',
          description: `File ${file.name} loaded as ${tableName}`,
        });
      } catch (error: any) {
        console.error(`Error loading file ${file.name}:`, error);
        toast({
          variant: 'destructive',
          title: 'Error',
          description: `Error loading file ${file.name}: ${error.message || error}`,
        });
      }
    }
    await refreshTableSchemas();
  };

  return (
    <RoomPanel type={RoomPanelTypes.enum['data-sources']}>
      <div className="mb-4">
        <label className="text-sm font-medium">Load Hugging Face Dataset</label>
        <div className="flex gap-2 mt-2">
          <Input
            value={hfId}
            onChange={(e) => setHfId(e.target.value)}
            placeholder="e.g., Anthropic/EconomicIndex"
            aria-label="Hugging Face Dataset ID"
            aria-describedby="hf-help-text"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !loading && hfId.trim()) {
                handleHuggingFaceLoad();
              }
            }}
          />
          <Button 
            disabled={loading || !hfId.trim()} 
            onClick={handleHuggingFaceLoad}
          >
            {loading ? 'Loading...' : 'Load'}
          </Button>
        </div>
        <div id="hf-help-text" className="text-xs text-muted-foreground mt-1">
          Enter a Hugging Face dataset ID in the format "organization/dataset-name"
        </div>
      </div>

      <FileDropzone
        className="h-[200px] p-5"
        acceptedFormats={{
          'text/csv': ['.csv'],
          'text/tsv': ['.tsv'],
          'application/octet-stream': ['.parquet'],
          'application/json': ['.json'],
          'application/jsonl': ['.jsonl'],
          'application/vnd.apache.arrow.file': ['.arrow'],
        }}
        onDrop={handleFileDrop}
      >
        <div className="text-muted-foreground text-xs">
          Files you add will stay local to your browser.
        </div>
      </FileDropzone>

      <TableStructurePanel />
    </RoomPanel>
  );
};