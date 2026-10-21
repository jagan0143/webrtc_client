import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { errorMessage, fieldErrors } from '../api/http';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    const found = {};
    if (!identifier.trim()) found.identifier = 'Enter your email or mobile number';
    if (!password) found.password = 'Enter your password';
    setErrors(found);
    setFormError('');
    if (Object.keys(found).length) return;

    setSubmitting(true);
    try {
      await login(identifier.trim(), password);
      void navigate('/contacts', { replace: true });
    } catch (err) {
      setErrors(fieldErrors(err));
      setFormError(errorMessage(err, 'Login failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-hero">
        <div className="logo">📞</div>
        <h1>Welcome back</h1>
        <p>Log in to see who's online and start calling.</p>
      </div>
      <form className="auth-form" onSubmit={onSubmit} noValidate>
        <label className={`field ${errors.identifier ? 'has-error' : ''}`}>
          <span className="field-label">Email or mobile number</span>
          <input
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            autoComplete="username"
            placeholder="jane@example.com"
          />
          {errors.identifier && <span className="field-error">{errors.identifier}</span>}
        </label>
        <label className={`field ${errors.password ? 'has-error' : ''}`}>
          <span className="field-label">Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
          {errors.password && <span className="field-error">{errors.password}</span>}
        </label>

        {formError && <p className="form-error" role="alert">{formError}</p>}
        <button type="submit" className="btn primary block" disabled={submitting}>
          {submitting ? 'Logging in…' : 'Log in'}
        </button>
        <p className="auth-switch">
          New here? <Link to="/register">Create an account</Link>
        </p>
      </form>
    </div>
  );
}
