#!/usr/bin/env python3
"""
Simple script to create basic icons for the Google Meet Tracker extension.
Creates placeholder icons in required sizes.
"""

from PIL import Image, ImageDraw, ImageFont
import os

def create_icon(size, color, is_active=False, output_path=""):
    """Create a simple icon with the given size and color"""
    
    # Create a new image with the specified size
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))  # Transparent background
    draw = ImageDraw.Draw(img)
    
    # Calculate dimensions
    center = size // 2
    radius = size // 3
    
    if is_active:
        # Active state - bright green circle with white "M"
        draw.ellipse([center - radius, center - radius, center + radius, center + radius], 
                    fill='#34a853', outline='#2d7d2d', width=2)
        
        # Draw "M" in the center
        try:
            if size >= 32:
                font_size = size // 4
                font = ImageFont.load_default()
            else:
                font = ImageFont.load_default()
            
            # Get text size and position to center it
            text = "M"
            bbox = draw.textbbox((0, 0), text, font=font)
            text_width = bbox[2] - bbox[0]
            text_height = bbox[3] - bbox[1]
            text_x = center - text_width // 2
            text_y = center - text_height // 2
            
            draw.text((text_x, text_y), text, fill='white', font=font)
        except:
            # Fallback if font loading fails
            draw.text((center - 4, center - 6), "M", fill='white')
    else:
        # Normal state - Google blue circle with white "M"
        draw.ellipse([center - radius, center - radius, center + radius, center + radius], 
                    fill='#4285f4', outline='#3367d6', width=2)
        
        # Draw "M" in the center
        try:
            if size >= 32:
                font_size = size // 4
                font = ImageFont.load_default()
            else:
                font = ImageFont.load_default()
            
            text = "M"
            bbox = draw.textbbox((0, 0), text, font=font)
            text_width = bbox[2] - bbox[0]
            text_height = bbox[3] - bbox[1]
            text_x = center - text_width // 2
            text_y = center - text_height // 2
            
            draw.text((text_x, text_y), text, fill='white', font=font)
        except:
            # Fallback if font loading fails
            draw.text((center - 4, center - 6), "M", fill='white')
    
    # Save the image
    img.save(output_path, 'PNG')
    print(f"Created icon: {output_path} ({size}x{size})")

def main():
    """Create all required icons"""
    
    # Create icons directory if it doesn't exist
    icons_dir = "icons"
    if not os.path.exists(icons_dir):
        os.makedirs(icons_dir)
    
    # Icon sizes required by Chrome extensions
    sizes = [16, 32, 48, 128]
    
    print("Creating Google Meet Tracker extension icons...")
    
    # Create normal state icons
    for size in sizes:
        icon_path = os.path.join(icons_dir, f"icon{size}.png")
        create_icon(size, '#4285f4', False, icon_path)
    
    # Create active state icons
    for size in sizes:
        icon_path = os.path.join(icons_dir, f"icon{size}-active.png")
        create_icon(size, '#34a853', True, icon_path)
    
    print(f"\nAll icons created successfully in the '{icons_dir}' directory!")
    print("You can now load the extension in Chrome.")

if __name__ == "__main__":
    main()
