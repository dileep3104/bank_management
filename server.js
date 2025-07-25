const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

// Initialize SQLite database
const db = new sqlite3.Database('./bank.db');

// Create tables
db.serialize(() => {
  // Customers table
  db.run(`CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Loans table
  db.run(`CREATE TABLE IF NOT EXISTS loans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER,
    principal_amount REAL NOT NULL,
    loan_period INTEGER NOT NULL,
    interest_rate REAL NOT NULL,
    total_amount REAL NOT NULL,
    monthly_emi REAL NOT NULL,
    amount_paid REAL DEFAULT 0,
    remaining_amount REAL NOT NULL,
    emis_left INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers (id)
  )`);

  // Transactions table
  db.run(`CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    loan_id INTEGER,
    transaction_type TEXT NOT NULL,
    amount REAL NOT NULL,
    transaction_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    remaining_balance REAL NOT NULL,
    FOREIGN KEY (loan_id) REFERENCES loans (id)
  )`);
});

// Helper function to calculate loan details
function calculateLoanDetails(principal, period, rate) {
  const interest = principal * period * (rate / 100);
  const totalAmount = principal + interest;
  const monthlyEMI = totalAmount / (period * 12);
  
  return {
    interest,
    totalAmount,
    monthlyEMI
  };
}

// Routes

// Get or create customer
app.post('/api/customer', (req, res) => {
  const { name } = req.body;
  
  // Check if customer exists
  db.get('SELECT * FROM customers WHERE name = ?', [name], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    if (row) {
      return res.json({ customer: row });
    }
    
    // Create new customer
    db.run('INSERT INTO customers (name) VALUES (?)', [name], function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      res.json({ 
        customer: { 
          id: this.lastID, 
          name: name,
          created_at: new Date().toISOString()
        }
      });
    });
  });
});

// LEND - Create a new loan
app.post('/api/lend', (req, res) => {
  const { customer_id, loan_amount, loan_period, interest_rate } = req.body;
  
  if (!customer_id || !loan_amount || !loan_period || !interest_rate) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  
  const loanDetails = calculateLoanDetails(loan_amount, loan_period, interest_rate);
  
  const stmt = db.prepare(`
    INSERT INTO loans (customer_id, principal_amount, loan_period, interest_rate, 
                      total_amount, monthly_emi, remaining_amount, emis_left)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run([
    customer_id,
    loan_amount,
    loan_period,
    interest_rate,
    loanDetails.totalAmount,
    loanDetails.monthlyEMI,
    loanDetails.totalAmount,
    loan_period * 12
  ], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    res.json({
      loan_id: this.lastID,
      principal_amount: loan_amount,
      total_amount: loanDetails.totalAmount,
      monthly_emi: loanDetails.monthlyEMI,
      total_interest: loanDetails.interest
    });
  });
  
  stmt.finalize();
});

// PAYMENT - Process loan payment
app.post('/api/payment', (req, res) => {
  const { loan_id, amount, payment_type } = req.body;
  
  if (!loan_id || !amount || !payment_type) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  
  // Get current loan details
  db.get('SELECT * FROM loans WHERE id = ?', [loan_id], (err, loan) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    if (!loan) {
      return res.status(404).json({ error: 'Loan not found' });
    }
    
    if (loan.remaining_amount <= 0) {
      return res.status(400).json({ error: 'Loan already paid off' });
    }
    
    if (amount > loan.remaining_amount) {
      return res.status(400).json({ error: 'Payment amount exceeds remaining balance' });
    }
    
    const newRemainingAmount = loan.remaining_amount - amount;
    const newAmountPaid = loan.amount_paid + amount;
    let newEmisLeft = loan.emis_left;
    
    if (payment_type === 'LUMP_SUM') {
      // Calculate new EMIs left based on remaining amount
      newEmisLeft = Math.ceil(newRemainingAmount / loan.monthly_emi);
    } else if (payment_type === 'EMI') {
      newEmisLeft = Math.max(0, loan.emis_left - 1);
    }
    
    // Update loan
    db.run(`
      UPDATE loans 
      SET remaining_amount = ?, amount_paid = ?, emis_left = ?
      WHERE id = ?
    `, [newRemainingAmount, newAmountPaid, newEmisLeft, loan_id], (err) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      // Record transaction
      db.run(`
        INSERT INTO transactions (loan_id, transaction_type, amount, remaining_balance)
        VALUES (?, ?, ?, ?)
      `, [loan_id, payment_type, amount, newRemainingAmount], (err) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        
        res.json({
          success: true,
          remaining_amount: newRemainingAmount,
          amount_paid: newAmountPaid,
          emis_left: newEmisLeft
        });
      });
    });
  });
});

// LEDGER - Get all transactions for a loan
app.get('/api/ledger/:loan_id', (req, res) => {
  const { loan_id } = req.params;
  
  // Get loan details
  db.get('SELECT * FROM loans WHERE id = ?', [loan_id], (err, loan) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    if (!loan) {
      return res.status(404).json({ error: 'Loan not found' });
    }
    
    // Get all transactions
    db.all(`
      SELECT * FROM transactions 
      WHERE loan_id = ? 
      ORDER BY transaction_date DESC
    `, [loan_id], (err, transactions) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      res.json({
        loan_details: {
          loan_id: loan.id,
          principal_amount: loan.principal_amount,
          total_amount: loan.total_amount,
          monthly_emi: loan.monthly_emi,
          remaining_amount: loan.remaining_amount,
          emis_left: loan.emis_left
        },
        transactions: transactions
      });
    });
  });
});

// ACCOUNT OVERVIEW - Get all loans for a customer
app.get('/api/overview/:customer_id', (req, res) => {
  const { customer_id } = req.params;
  
  db.all(`
    SELECT 
      id as loan_id,
      principal_amount,
      total_amount,
      monthly_emi,
      (total_amount - principal_amount) as total_interest,
      amount_paid,
      remaining_amount,
      emis_left,
      created_at
    FROM loans 
    WHERE customer_id = ?
    ORDER BY created_at DESC
  `, [customer_id], (err, loans) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    res.json({ loans });
  });
});

// Serve HTML pages
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/lend', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'lend.html'));
});

app.get('/payment', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'payment.html'));
});

app.get('/ledger', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'ledger.html'));
});

app.get('/overview', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'overview.html'));
});

app.listen(PORT, () => {
  console.log(`Bank Loan Management System running on http://localhost:${PORT}`);
});