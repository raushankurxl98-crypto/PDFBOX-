
import React from 'react';

const Hero: React.FC = () => {
  return (
    <section className="bg-white py-20 sm:py-24 lg:py-32">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-gray-900 tracking-tight">
          Every tool you need to work with PDFs
        </h1>
        <p className="mt-6 max-w-3xl mx-auto text-lg sm:text-xl text-gray-600">
          PDF Box is your go-to place for all PDF tasks. Merge, split, compress, convert, and more, completely free and easy to use.
        </p>
      </div>
    </section>
  );
};

export default Hero;
