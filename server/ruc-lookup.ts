import type { Express } from "express";

import { rucLookupLimiter } from "./middleware/rateLimits";

export function setupRUCLookup(app: Express) {
  // RUC lookup proxy endpoint (to avoid CORS issues). Unauthenticated by
  // design (it is used on the public registration form) but rate-limited so
  // the server cannot be abused as a free relay against the SUNAT API.
  app.get('/api/lookup-ruc/:ruc', rucLookupLimiter, async (req, res) => {
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