import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { errorMessage, fieldErrors } from '../api/http';
import { useAuth } from '../context/AuthContext';

const EMPTY = { name: '', mobile: '', email: '', address: '', password: '', confirm: '' };

function validate(f) {
  const e = {};
  const mobile = f.mobile.replace(/[\s\-().]/g, '');
  if (f.name.trim().length < 2) e.name = 'Enter your name (at least 2 characters)';
  if (!/^\+?\d{10,15}$/.test(mobile)) e.mobile = 'Enter a valid mobile number (10–15 digits)';
  if (!/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(f.email.trim())) e.email = 'Enter a valid email address';
  if (f.address.trim().length < 3) e.address = 'Enter your address';
  if (f.password.length < 6) e.password = 'Use at least 6 characters';
  if (f.confirm !== f.password) e.confirm = 'Passwords do not match';
  return e;
}

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const update = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    if (errors[key]) setErrors((errs) => ({ ...errs, [key]: undefined }));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    const found = validate(form);
    setErrors(found);
    setFormError('');
    if (Object.keys(found).length) return;

    setSubmitting(true);
    try {
      const { confirm, ...payload } = form; // eslint-disable-line no-unused-vars
      await register(payload);
      void navigate('/contacts', { replace: true });
    } catch (err) {
      setErrors(fieldErrors(err));
      setFormError(errorMessage(err, 'Registration failed'));
    } finally {
      setSubmitting(false);
    }
  };

  const field = (key, label, { as, ...props } = {}) => (
    <label className={`field ${errors[key] ? 'has-error' : ''}`}>
      <span className="field-label">{label}</span>
      {as === 'textarea' ? (
        <textarea rows={2} value={form[key]} onChange={update(key)} maxLength={250} {...props} />
      ) : (
        <input value={form[key]} onChange={update(key)} {...props} />
      )}
      {errors[key] && <span className="field-error">{errors[key]}</span>}
    </label>
  );

  return (
    <div className="auth-page">
      <div className="auth-hero">
        <div className="logo">📞</div>
        <h1>Create account</h1>
        <p>Call anyone on CallMe over the internet.</p>
      </div>
      <form className="auth-form" onSubmit={onSubmit} noValidate>
        {field('name', 'Full name', { autoComplete: 'name', placeholder: 'Jane Doe' })}
        {field('mobile', 'Mobile number', {
          type: 'tel',
          inputMode: 'tel',
          autoComplete: 'tel',
          placeholder: '+91 98765 43210',
        })}
        {field('email', 'Email', { type: 'email', autoComplete: 'email', placeholder: 'jane@example.com' })}
        {field('address', 'Address', { as: 'textarea', autoComplete: 'street-address', placeholder: 'Street, city' })}
        {field('password', 'Password', { type: 'password', autoComplete: 'new-password' })}
        {field('confirm', 'Confirm password', { type: 'password', autoComplete: 'new-password' })}

        {formError && <p className="form-error" role="alert">{formError}</p>}
        <button type="submit" className="btn primary block" disabled={submitting}>
          {submitting ? 'Creating account…' : 'Register'}
        </button>
        <p className="auth-switch">
          Already registered? <Link to="/login">Log in</Link>
        </p>
      </form>
    </div>
  );
}
