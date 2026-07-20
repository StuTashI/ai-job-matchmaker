export const ROLE_SUGGESTIONS = [
  "Product Manager",
  "Senior Product Manager",
  "Staff Product Manager",
  "Principal Product Manager",
  "Lead Product Manager",
  "Associate Product Manager",
  "Group Product Manager",
  "Technical Product Manager",
  "Growth Product Manager",
  "Platform Product Manager",
  "Product Owner",
  "Associate Director of Product",
  "Director of Product",
  "Senior Director of Product",
  "VP of Product",
  "Head of Product",
  "Chief Product Officer",
  "Product Marketing Manager",
  "Product Analyst",
  "Program Manager",
];

// All genuinely Product-Management-track titles from the suggestions above, minus
// Associate Product Manager — used as the default auto-selected role chips on both the
// Find Jobs and LinkedIn Job Posts tabs. Deliberately excludes adjacent-but-different
// functions (Product Marketing Manager, Product Analyst, Program Manager).
export const PRODUCT_MANAGEMENT_ROLES = ROLE_SUGGESTIONS.filter(
  (role) => !["Associate Product Manager", "Product Marketing Manager", "Product Analyst", "Program Manager"].includes(role),
);

export const LOCATION_SUGGESTIONS = [
  "Bengaluru, Karnataka",
  "Mumbai, Maharashtra",
  "Delhi NCR",
  "Gurugram, Haryana",
  "Noida, Uttar Pradesh",
  "Pune, Maharashtra",
  "Hyderabad, Telangana",
  "Chennai, Tamil Nadu",
  "Kolkata, West Bengal",
  "Ahmedabad, Gujarat",
  "Remote",
  "Remote, India",
  "United States",
  "United Kingdom",
  "Singapore",
];
