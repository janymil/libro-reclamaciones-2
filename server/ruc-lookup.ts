import type { Express } from "express";

export function setupRUCLookup(app: Express) {
  // RUC lookup proxy endpoint (to avoid CORS issues)
  app.get('/api/lookup-ruc/:ruc', async (req, res) => {
    try {
      const { ruc } = req.params;
      
      // Validate RUC format
      if (!ruc || ruc.length !== 11 || !/^\d+$/.test(ruc)) {
        return res.status(400).json({ 
          error: 'RUC inválido', 
          message: 'El RUC debe tener exactamente 11 dígitos' 
        });
      }

      // Call SUNAT API
      const response = await fetch(`https://sunat-api.vpscenter.us/?ruc=${ruc}`);
      const data = await response.json();
      
      res.json(data);
    } catch (error) {
      console.error('Error fetching RUC data:', error);
      res.status(500).json({ 
        error: 'Error de servidor', 
        message: 'No se pudo consultar el RUC' 
      });
    }
  });
}