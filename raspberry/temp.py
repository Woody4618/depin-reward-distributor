##
 # Maker's Digest
 # DHTxx Temperature and Humidity Example.
 #
 # Dont forget to install Adafruit_DHT! See README.md for details.
##
import sys
from time import sleep  # Import Sleep module from time library
import Adafruit_DHT     # Import the Adafruit_DHT module
import time
import board
import adafruit_dht

pin = 4                 # Set pin to pin 4
dly = 2                 # Set delay to 2000ms (2 seconds) Can be changed to 1 for DHT22
sensor_type = 11        # Sensor type: Change this to 22 if using DHT22, or leave
                        # at 11 for DHT11

dhtDevice = adafruit_dht.DHT11(board.D4)

try: 
    while True:
        # Introduce our delay
        sleep(dly)
        
        # Read from sensor
        try:
            temperature_c = dhtDevice.temperature
            humidity = dhtDevice.humidity
            print(f"Temp: {temperature_c:.1f}C  Humidity: {humidity:.1f}%")
        except Exception as e:
            print("Reading failed:", e)

except KeyboardInterrupt:
    sys.exit()